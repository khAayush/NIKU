import { DateTime } from 'luxon';
import { prisma } from '../lib/prisma.js';
import { getBoss, QUEUES } from './queue.js';

export interface ReminderJobData {
  reminderId: string;
  /** The reminder time this job was scheduled for (ISO). Stale jobs are ignored. */
  remindAt: string;
}

/** All-day tasks count "minutes before" back from this local hour on their day. */
export const ALL_DAY_REMINDER_HOUR = 6;

/** The moment "X minutes before" counts back from: the due time, or 6:00 for all-day tasks. */
export function reminderBase(dueAt: Date, dueAllDay: boolean, tz: string): Date {
  if (!dueAllDay) return dueAt;
  return DateTime.fromJSDate(dueAt, { zone: tz })
    .set({ hour: ALL_DAY_REMINDER_HOUR, minute: 0, second: 0, millisecond: 0 })
    .toJSDate();
}

/** When each of the user's reminders fires for a task, keyed by minutes before. */
export function reminderTimes(
  dueAt: Date,
  dueAllDay: boolean,
  tz: string,
  minutes: number[],
): Map<number, Date> {
  const base = reminderBase(dueAt, dueAllDay, tz).getTime();
  return new Map(minutes.map((m) => [m, new Date(base - m * 60_000)]));
}

async function schedule(reminderId: string, remindAt: Date): Promise<string | null> {
  const boss = await getBoss();
  const data: ReminderJobData = { reminderId, remindAt: remindAt.toISOString() };
  return boss.send(QUEUES.reminder, data, { startAfter: remindAt });
}

async function cancel(jobId: string | null) {
  if (jobId) await (await getBoss()).cancel(QUEUES.reminder, jobId);
}

/**
 * Makes a task's reminders match its due date and its owner's reminder settings: creates and
 * schedules missing ones, reschedules moved ones, and cancels ones that no longer apply.
 * Reminder times already in the past are skipped (never sent late). Completed tasks have none.
 * Call after anything that changes a task's due date or status, or the user's settings.
 */
export async function syncTaskReminders(taskId: string, now = new Date()): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { reminders: true, user: { select: { timezone: true, reminderMinutes: true } } },
  });
  if (!task) return;

  const wanted =
    task.status === 'OPEN' && task.dueAt
      ? reminderTimes(task.dueAt, task.dueAllDay, task.user.timezone, task.user.reminderMinutes)
      : new Map<number, Date>();

  for (const r of task.reminders) {
    // Snoozes stay until delivered, unless the task is no longer open.
    if (r.minutesBefore === null) {
      if (task.status !== 'OPEN') {
        await cancel(r.jobId);
        await prisma.taskReminder.delete({ where: { id: r.id } });
      }
      continue;
    }
    const at = wanted.get(r.minutesBefore);
    wanted.delete(r.minutesBefore);
    if (at && at.getTime() === r.remindAt.getTime()) continue; // unchanged

    await cancel(r.jobId);
    if (at && at > now) {
      const jobId = await schedule(r.id, at);
      await prisma.taskReminder.update({
        where: { id: r.id },
        data: { remindAt: at, jobId, sentAt: null },
      });
    } else {
      await prisma.taskReminder.delete({ where: { id: r.id } });
    }
  }

  for (const [minutesBefore, at] of wanted) {
    if (at <= now) continue;
    const reminder = await prisma.taskReminder.create({
      data: { taskId, minutesBefore, remindAt: at },
    });
    const jobId = await schedule(reminder.id, at);
    await prisma.taskReminder.update({ where: { id: reminder.id }, data: { jobId } });
  }
}

/** Re-syncs every open, dated task of a user (after their reminder settings or timezone change). */
export async function syncUserReminders(userId: string): Promise<void> {
  const tasks = await prisma.task.findMany({
    where: { userId, status: 'OPEN', dueAt: { not: null } },
    select: { id: true },
  });
  for (const t of tasks) await syncTaskReminders(t.id);
}

/** Cancels every scheduled reminder of a task (before deleting it). */
export async function cancelTaskReminders(taskId: string): Promise<void> {
  const reminders = await prisma.taskReminder.findMany({
    where: { taskId },
    select: { jobId: true },
  });
  for (const r of reminders) await cancel(r.jobId);
}

/** Snooze: replaces any pending snooze of the task with a one-off reminder at `at`. */
export async function snoozeReminder(taskId: string, at: Date): Promise<void> {
  const pending = await prisma.taskReminder.findMany({
    where: { taskId, minutesBefore: null, sentAt: null },
  });
  for (const r of pending) await cancel(r.jobId);
  await prisma.taskReminder.deleteMany({ where: { id: { in: pending.map((r) => r.id) } } });

  const reminder = await prisma.taskReminder.create({ data: { taskId, remindAt: at } });
  const jobId = await schedule(reminder.id, at);
  await prisma.taskReminder.update({ where: { id: reminder.id }, data: { jobId } });
}
