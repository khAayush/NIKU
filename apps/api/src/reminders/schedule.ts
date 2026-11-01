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
/** All-day tasks become overdue at midnight; their "deadline passed" notice waits until 9:00. */
export const ALL_DAY_DEADLINE_HOUR = 9;

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

/**
 * When the "deadline passed" notice fires: at the due time, or for all-day tasks at 9:00 the
 * next day (in the user's timezone), so nobody is woken at midnight.
 */
export function deadlineTime(dueAt: Date, dueAllDay: boolean, tz: string): Date {
  if (!dueAllDay) return dueAt;
  return DateTime.fromJSDate(dueAt, { zone: tz })
    .startOf('day')
    .plus({ days: 1 })
    .set({ hour: ALL_DAY_DEADLINE_HOUR })
    .toJSDate();
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
 * schedules missing ones, reschedules moved ones, and cancels ones that no longer apply. Every
 * open task with a due date also gets a "deadline passed" notice (always on).
 * Times already in the past are skipped (never sent late). Completed tasks have none.
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
  let deadlineAt =
    task.status === 'OPEN' && task.dueAt
      ? deadlineTime(task.dueAt, task.dueAllDay, task.user.timezone)
      : null;

  for (const r of task.reminders) {
    if (r.deadline) {
      const at = deadlineAt;
      deadlineAt = null; // handled here, nothing to create below
      if (at && at.getTime() === r.remindAt.getTime()) continue; // unchanged (sent or not)
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
      continue;
    }
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

  if (deadlineAt && deadlineAt > now) {
    const reminder = await prisma.taskReminder.create({
      data: { taskId, deadline: true, remindAt: deadlineAt },
    });
    const jobId = await schedule(reminder.id, deadlineAt);
    await prisma.taskReminder.update({ where: { id: reminder.id }, data: { jobId } });
  }
}

/**
 * Gives open tasks that haven't reached their deadline notice yet one if they lack it (tasks
 * created before the notice existed). Runs at startup; cheap when there is nothing to do.
 */
export async function addMissingDeadlineReminders(now = new Date()): Promise<number> {
  // All-day notices fire the next morning, so look back a little over a day.
  const tasks = await prisma.task.findMany({
    where: {
      status: 'OPEN',
      dueAt: { gt: new Date(now.getTime() - 36 * 3600_000) },
      reminders: { none: { deadline: true } },
    },
    select: { id: true },
  });
  for (const t of tasks) await syncTaskReminders(t.id, now);
  return tasks.length;
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
    where: { taskId, minutesBefore: null, deadline: false, sentAt: null },
  });
  for (const r of pending) await cancel(r.jobId);
  await prisma.taskReminder.deleteMany({ where: { id: { in: pending.map((r) => r.id) } } });

  const reminder = await prisma.taskReminder.create({ data: { taskId, remindAt: at } });
  const jobId = await schedule(reminder.id, at);
  await prisma.taskReminder.update({ where: { id: reminder.id }, data: { jobId } });
}
