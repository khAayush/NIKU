import { prisma } from '../lib/prisma.js';
import { getBoss, QUEUES } from './queue.js';

export interface ReminderJobData {
  taskId: string;
  /** The reminder time this job was scheduled for (ISO). Stale jobs are ignored. */
  remindAt: string;
}

interface SchedulableTask {
  id: string;
  status: 'OPEN' | 'COMPLETED';
  remindAt: Date | null;
  reminderJobId: string | null;
}

/**
 * Makes the scheduled job match the task: cancels the previous job and, for an open task with a
 * reminder, schedules a new one at `remindAt` (a time in the past runs right away).
 *
 * `reminderChanged` marks the reminder as not yet sent, so a new reminder time (an edit or a
 * snooze) is delivered even if an earlier one was.
 */
export async function scheduleReminder(task: SchedulableTask, { reminderChanged = false } = {}) {
  const boss = await getBoss();
  if (task.reminderJobId) await boss.cancel(QUEUES.reminder, task.reminderJobId);

  let jobId: string | null = null;
  if (task.status === 'OPEN' && task.remindAt) {
    const data: ReminderJobData = { taskId: task.id, remindAt: task.remindAt.toISOString() };
    jobId = await boss.send(QUEUES.reminder, data, { startAfter: task.remindAt });
  }

  await prisma.task.updateMany({
    where: { id: task.id },
    data: { reminderJobId: jobId, ...(reminderChanged ? { reminderSentAt: null } : {}) },
  });
}

/** Cancels the task's scheduled reminder job, if any (e.g. before deleting the task). */
export async function cancelReminder(task: Pick<SchedulableTask, 'reminderJobId'>) {
  if (!task.reminderJobId) return;
  const boss = await getBoss();
  await boss.cancel(QUEUES.reminder, task.reminderJobId);
}
