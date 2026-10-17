import { DateTime } from 'luxon';
import webpush from 'web-push';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { sendMail } from '../lib/mailer.js';
import { prisma } from '../lib/prisma.js';
import { getBoss, QUEUES } from './queue.js';
import type { ReminderJobData } from './schedule.js';

export const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (pushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
}

/** What every channel shows for a reminder. Also the Socket.IO `reminder` event payload. */
export interface ReminderPayload {
  taskId: string;
  title: string;
  dueAt: string | null;
  dueAllDay: boolean;
  remindAt: string;
  /** Human-readable due date in the user's timezone, e.g. "Sun 18 Oct, 17:00". */
  dueLabel: string | null;
  url: string;
}

type RealtimeEmitter = (userId: string, payload: ReminderPayload) => void;
let emitRealtime: RealtimeEmitter = () => {};

/** Set by the Socket.IO server; until then in-app delivery is a no-op (e.g. in tests). */
export function setRealtimeEmitter(emitter: RealtimeEmitter) {
  emitRealtime = emitter;
}

export interface PushJobData extends ReminderJobData {
  subscriptionId: string;
}

function dueLabel(dueAt: Date | null, allDay: boolean, tz: string) {
  if (!dueAt) return null;
  const d = DateTime.fromJSDate(dueAt, { zone: tz });
  return allDay ? d.toFormat('ccc d LLL') : d.toFormat('ccc d LLL, HH:mm');
}

/** Loads the task if this reminder is still current (open, same reminder time). */
async function currentTask(data: ReminderJobData) {
  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    include: { user: true },
  });
  if (!task || task.status !== 'OPEN' || task.remindAt?.toISOString() !== data.remindAt)
    return null;
  return task;
}

function payloadFor(task: NonNullable<Awaited<ReturnType<typeof currentTask>>>): ReminderPayload {
  return {
    taskId: task.id,
    title: task.title,
    dueAt: task.dueAt?.toISOString() ?? null,
    dueAllDay: task.dueAllDay,
    remindAt: task.remindAt!.toISOString(),
    dueLabel: dueLabel(task.dueAt, task.dueAllDay, task.user.timezone),
    url: `${env.WEB_ORIGIN}/today`,
  };
}

/**
 * Runs when a reminder comes due. Claims it (so it is delivered once even if the job runs twice,
 * e.g. scheduled job + startup catch-up), emits it in-app, and enqueues push and email
 * deliveries, each with their own retries. Returns whether it was sent.
 */
export async function handleReminder(data: ReminderJobData): Promise<'sent' | 'skipped'> {
  const claimed = await prisma.task.updateMany({
    where: {
      id: data.taskId,
      status: 'OPEN',
      remindAt: new Date(data.remindAt),
      reminderSentAt: null,
    },
    data: { reminderSentAt: new Date() },
  });
  if (claimed.count === 0) return 'skipped';

  const task = await currentTask(data);
  if (!task) return 'skipped';
  const { user } = task;

  if (user.notifyInApp) emitRealtime(user.id, payloadFor(task));

  const boss = await getBoss();
  if (user.notifyPush && pushEnabled) {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    for (const sub of subscriptions) {
      const job: PushJobData = { ...data, subscriptionId: sub.id };
      await boss.send(QUEUES.push, job);
    }
  }
  if (user.notifyEmail) await boss.send(QUEUES.email, data);
  return 'sent';
}

/** Sends one Web Push message. Throws on failure so pg-boss retries. */
export async function deliverPush(data: PushJobData): Promise<void> {
  const task = await currentTask(data);
  const sub = await prisma.pushSubscription.findUnique({ where: { id: data.subscriptionId } });
  if (!task || !sub || !task.user.notifyPush || !pushEnabled) return;

  // `inApp` lets the service worker skip the system notification when an open, focused tab
  // already shows the in-app one.
  const payload = { ...payloadFor(task), inApp: task.user.notifyInApp };
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60, urgency: 'high', topic: task.id.replace(/-/g, '').slice(0, 32) },
    );
  } catch (err) {
    // The browser unsubscribed or the subscription expired: forget it, nothing to retry.
    if (err instanceof webpush.WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
      await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
      logger.info({ subscriptionId: sub.id }, 'Removed expired push subscription');
      return;
    }
    throw err;
  }
}

/** Sends the reminder email. Throws on failure so pg-boss retries. */
export async function deliverEmail(data: ReminderJobData): Promise<void> {
  const task = await currentTask(data);
  if (!task || !task.user.notifyEmail) return;

  const p = payloadFor(task);
  await sendMail({
    to: task.user.email,
    subject: `Reminder: ${task.title}`,
    text:
      `Hi ${task.user.name},\n\nThis is your reminder for:\n\n  ${task.title}\n` +
      (p.dueLabel ? `  Due: ${p.dueLabel}\n` : '') +
      `\nOpen your tasks: ${p.url}\n\n` +
      `You can change which reminders you get in Settings.`,
  });
}
