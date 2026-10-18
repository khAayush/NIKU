import { DateTime } from 'luxon';
import webpush from 'web-push';
import { renderEmail } from '../lib/email-template.js';
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

/** Loads the reminder and its task if it is still current (task open, same reminder time). */
async function currentReminder(data: ReminderJobData) {
  if (!data.reminderId) return null; // job from an older version of the app
  const reminder = await prisma.taskReminder.findUnique({
    where: { id: data.reminderId },
    include: { task: { include: { user: true } } },
  });
  if (
    !reminder ||
    reminder.task.status !== 'OPEN' ||
    reminder.remindAt.toISOString() !== data.remindAt
  ) {
    return null;
  }
  return reminder;
}

type CurrentReminder = NonNullable<Awaited<ReturnType<typeof currentReminder>>>;

function payloadFor({ task, remindAt }: CurrentReminder): ReminderPayload {
  return {
    taskId: task.id,
    title: task.title,
    dueAt: task.dueAt?.toISOString() ?? null,
    dueAllDay: task.dueAllDay,
    remindAt: remindAt.toISOString(),
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
  const reminder = await currentReminder(data);
  if (!reminder) return 'skipped';
  const claimed = await prisma.taskReminder.updateMany({
    where: { id: reminder.id, remindAt: reminder.remindAt, sentAt: null },
    data: { sentAt: new Date() },
  });
  if (claimed.count === 0) return 'skipped';
  const { user } = reminder.task;

  if (user.notifyInApp) emitRealtime(user.id, payloadFor(reminder));

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
  const reminder = await currentReminder(data);
  const sub = await prisma.pushSubscription.findUnique({ where: { id: data.subscriptionId } });
  if (!reminder || !sub || !reminder.task.user.notifyPush || !pushEnabled) return;
  const { task } = reminder;

  // `inApp` lets the service worker skip the system notification when an open, focused tab
  // already shows the in-app one.
  const payload = { ...payloadFor(reminder), inApp: task.user.notifyInApp };
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
  const reminder = await currentReminder(data);
  if (!reminder || !reminder.task.user.notifyEmail) return;
  const { task } = reminder;

  const p = payloadFor(reminder);
  await sendMail({
    to: task.user.email,
    subject: `Reminder: ${task.title}`,
    ...renderEmail({
      preheader: p.dueLabel ? `Due ${p.dueLabel}` : `A reminder for ${task.title}`,
      eyebrow: 'Reminder',
      heading: task.title,
      paragraphs: [`Hi ${task.user.name}, here's your reminder for this task.`],
      details: p.dueLabel ? [{ label: 'Due', value: p.dueLabel }] : [],
      button: { label: 'Open NIKU', url: p.url },
      note: 'You can change when and how you get reminders in Settings.',
    }),
  });
}
