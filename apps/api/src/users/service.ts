import { localToUtc, toLocalDate, type Me, type UpdateMeInput } from '@todo/shared';
import { notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { syncUserReminders } from '../reminders/schedule.js';

const meSelect = {
  id: true,
  name: true,
  email: true,
  timezone: true,
  notifyInApp: true,
  notifyPush: true,
  notifyEmail: true,
  reminderHours: true,
  createdAt: true,
} as const;

type MeRow = Omit<Me, 'createdAt'> & { createdAt: Date };
const toMe = (row: MeRow): Me => ({ ...row, createdAt: row.createdAt.toISOString() });

export async function getMe(userId: string): Promise<Me> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: meSelect });
  if (!row) throw notFound('User not found');
  return toMe(row);
}

export async function updateMe(userId: string, input: UpdateMeInput): Promise<Me> {
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, reminderHours: true },
  });
  const row = await prisma.user.update({ where: { id: userId }, data: input, select: meSelect });
  if (before && input.timezone !== undefined && input.timezone !== before.timezone) {
    await keepAllDayDates(userId, before.timezone, input.timezone);
  }

  // Reminder times depend on these, so move every open task's reminders to match.
  const hoursChanged =
    input.reminderHours !== undefined &&
    input.reminderHours.join() !== before?.reminderHours.join();
  const timezoneChanged = input.timezone !== undefined && input.timezone !== before?.timezone;
  if (hoursChanged || timezoneChanged) await syncUserReminders(userId);
  return toMe(row);
}

/**
 * All-day tasks are stored as the start of their day in the user's timezone. After a timezone
 * change, move them to the start of the same calendar day in the new zone, so "Friday" stays Friday.
 */
async function keepAllDayDates(userId: string, fromTz: string, toTz: string) {
  const tasks = await prisma.task.findMany({
    where: { userId, dueAllDay: true, dueAt: { not: null } },
    select: { id: true, dueAt: true },
  });
  await prisma.$transaction(
    tasks.map((t) =>
      prisma.task.update({
        where: { id: t.id },
        data: { dueAt: localToUtc(toLocalDate(t.dueAt!, fromTz), null, toTz)! },
      }),
    ),
  );
}
