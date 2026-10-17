import type { Job } from 'pg-boss';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { deliverEmail, deliverPush, handleReminder, type PushJobData } from './deliver.js';
import { getBoss, QUEUES, RETRY_LIMIT } from './queue.js';
import type { ReminderJobData } from './schedule.js';

/** Runs a job handler; logs failures (and the final give-up) before pg-boss retries. */
async function runLogged<T extends object>(
  queue: string,
  job: Job<T>,
  fn: (data: T) => Promise<unknown>,
) {
  try {
    await fn(job.data);
  } catch (err) {
    const finalAttempt = job.retryCount >= RETRY_LIMIT;
    const log = { err, queue, jobId: job.id, attempt: job.retryCount + 1, data: job.data };
    if (finalAttempt) logger.error(log, 'Reminder delivery failed, giving up');
    else logger.warn(log, 'Reminder delivery failed, will retry');
    throw err;
  }
}

/** Starts processing reminder jobs. Called once by the server at startup. */
export async function startReminderWorkers() {
  const boss = await getBoss();
  await boss.work<ReminderJobData>(QUEUES.reminder, async (jobs) => {
    for (const job of jobs) await runLogged(QUEUES.reminder, job, handleReminder);
  });
  await boss.work<PushJobData>(QUEUES.push, async (jobs) => {
    for (const job of jobs) await runLogged(QUEUES.push, job, deliverPush);
  });
  await boss.work<ReminderJobData>(QUEUES.email, async (jobs) => {
    for (const job of jobs) await runLogged(QUEUES.email, job, deliverEmail);
  });
}

/**
 * Finds reminders that came due without being sent (e.g. while the server was down) and
 * queues them to go out now. Safe to run alongside the original jobs: delivery is claimed once.
 */
export async function catchUpMissedReminders(now = new Date()): Promise<number> {
  const missed = await prisma.task.findMany({
    where: { status: 'OPEN', remindAt: { lte: now }, reminderSentAt: null },
    select: { id: true, remindAt: true },
  });
  if (!missed.length) return 0;

  const boss = await getBoss();
  for (const task of missed) {
    const data: ReminderJobData = { taskId: task.id, remindAt: task.remindAt!.toISOString() };
    await boss.send(QUEUES.reminder, data);
  }
  logger.info({ count: missed.length }, 'Queued missed reminders');
  return missed.length;
}
