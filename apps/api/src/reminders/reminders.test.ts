import { localToUtc, type ReminderPayload, type Task } from '@todo/shared';
import { DateTime } from 'luxon';
import { io as connect } from 'socket.io-client';
import webpush from 'web-push';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { outbox } from '../lib/mailer.js';
import { prisma } from '../lib/prisma.js';
import { request, resetState, signUp, type TestApp } from '../../test/helpers.js';
import {
  deliverEmail,
  deliverPush,
  handleReminder,
  setRealtimeEmitter,
  type PushJobData,
} from './deliver.js';
import { getBoss, QUEUES } from './queue.js';
import type { ReminderJobData } from './schedule.js';
import { attachSocketServer } from './socket.js';
import { catchUpMissedReminders, startReminderWorkers } from './workers.js';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());
beforeEach(resetState);
afterEach(() => {
  vi.restoreAllMocks();
  setRealtimeEmitter(() => {});
});

type User = Awaited<ReturnType<typeof signUp>>;
const MIN = 60_000;
const HOUR = 60 * MIN;
const inMinutes = (n: number) => new Date(Date.now() + n * MIN);
const iso = (d: Date) => d.toISOString();

const call = (u: User, method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  request(app, { method, url, cookie: u.cookie, payload });

async function createTask(u: User, payload: object): Promise<Task> {
  const res = await call(u, 'POST', '/api/tasks', payload);
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json();
}

const setMinutes = (u: User, reminderMinutes: number[]) =>
  call(u, 'PATCH', '/api/me', { reminderMinutes });

/** The task's reminders, earliest first. */
const reminders = (taskId: string) =>
  prisma.taskReminder.findMany({ where: { taskId }, orderBy: { remindAt: 'asc' } });

async function job(id: string | null) {
  if (!id) return null;
  const [found] = await (await getBoss()).findJobs<ReminderJobData>(QUEUES.reminder, { id });
  return found ?? null;
}

async function queued(queue: string) {
  return (await getBoss()).findJobs<Record<string, unknown>>(queue, { queued: true });
}

/** A task with a reminder that is already due (made directly, so nothing is scheduled). */
async function dueReminder(
  u: User,
  {
    title = 'Call the dentist',
    status = 'OPEN' as 'OPEN' | 'COMPLETED',
    sentAt = null as Date | null,
  } = {},
) {
  const task = await prisma.task.create({
    data: { userId: u.id, title, dueAt: inMinutes(30), status },
  });
  const reminder = await prisma.taskReminder.create({
    data: { taskId: task.id, minutesBefore: 60, remindAt: inMinutes(-1), sentAt },
  });
  const data: ReminderJobData = { reminderId: reminder.id, remindAt: iso(reminder.remindAt) };
  return { task, reminder, data };
}

describe('reminders from settings', () => {
  it('new users get one reminder, 1 hour before', async () => {
    const u = await signUp(app);
    const me = (await request(app, { method: 'GET', url: '/api/me', cookie: u.cookie })).json();
    expect(me.reminderMinutes).toEqual([60]);
  });

  it('creates one scheduled reminder per chosen time', async () => {
    const u = await signUp(app);
    await setMinutes(u, [1440, 60, 120]);
    const due = inMinutes(3 * 24 * 60);
    const t = await createTask(u, { title: 'A', dueAt: iso(due) });

    const rows = await reminders(t.id);
    expect(rows.map((r) => r.minutesBefore)).toEqual([1440, 120, 60]);
    for (const r of rows) {
      expect(r.remindAt.getTime()).toBe(due.getTime() - r.minutesBefore! * MIN);
      const j = await job(r.jobId);
      expect(j).toMatchObject({ state: 'created', data: { reminderId: r.id } });
      expect(j!.startAfter.getTime()).toBe(r.remindAt.getTime());
    }
    expect(t.nextReminderAt).toBe(iso(rows[0]!.remindAt));
  });

  it('skips reminder times that have already passed', async () => {
    const u = await signUp(app);
    await setMinutes(u, [1440, 120, 60, 30]);
    const t = await createTask(u, { title: 'Soon', dueAt: iso(inMinutes(90)) });
    expect((await reminders(t.id)).map((r) => r.minutesBefore)).toEqual([60, 30]);
  });

  it('counts back from 6:00 on the day for all-day tasks', async () => {
    const tz = 'Europe/London';
    const u = await signUp(app, { timezone: tz });
    await setMinutes(u, [1440, 60, 30]);
    const day = DateTime.now().setZone(tz).plus({ days: 5 }).toFormat('yyyy-MM-dd');
    const t = await createTask(u, {
      title: 'Holiday',
      dueAt: iso(localToUtc(day, null, tz)!),
      dueAllDay: true,
    });
    const times = (await reminders(t.id)).map((r) =>
      DateTime.fromJSDate(r.remindAt, { zone: tz }).toFormat("yyyy-MM-dd'T'HH:mm"),
    );
    const prev = DateTime.fromISO(day, { zone: tz }).minus({ days: 1 }).toFormat('yyyy-MM-dd');
    expect(times).toEqual([`${prev}T06:00`, `${day}T05:00`, `${day}T05:30`]);
  });

  it('gives tasks without a due date no reminders', async () => {
    const u = await signUp(app);
    const t = await createTask(u, { title: 'Someday', priority: 'LOW' });
    expect(await reminders(t.id)).toEqual([]);
    expect(t.nextReminderAt).toBeNull();
  });

  it('gives no reminders when the user chose none', async () => {
    const u = await signUp(app);
    await setMinutes(u, []);
    const t = await createTask(u, { title: 'A', dueAt: iso(inMinutes(600)) });
    expect(await reminders(t.id)).toEqual([]);
  });

  it('re-syncs every open task when the settings change', async () => {
    const u = await signUp(app);
    const due = inMinutes(3 * 24 * 60);
    const open = await createTask(u, { title: 'Open', dueAt: iso(due) });
    const done = await createTask(u, { title: 'Done', dueAt: iso(due) });
    await call(u, 'POST', `/api/tasks/${done.id}/complete`);
    const oneHourJob = (await reminders(open.id))[0]!.jobId;

    const res = await setMinutes(u, [120, 2880, 120, 30]);
    expect(res.json().reminderMinutes).toEqual([2880, 120, 30]);

    expect((await reminders(open.id)).map((r) => r.minutesBefore)).toEqual([2880, 120, 30]);
    expect((await job(oneHourJob))!.state).toBe('cancelled');
    expect(await reminders(done.id)).toEqual([]);
  });

  it('rejects times that are not offered', async () => {
    const u = await signUp(app);
    const res = await setMinutes(u, [45]);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('moves all-day reminders when the timezone changes', async () => {
    const u = await signUp(app, { timezone: 'Europe/London' });
    const day = DateTime.now().setZone('Europe/London').plus({ days: 5 }).toFormat('yyyy-MM-dd');
    const t = await createTask(u, {
      title: 'All day',
      dueAt: iso(localToUtc(day, null, 'Europe/London')!),
      dueAllDay: true,
    });
    const before = (await reminders(t.id))[0]!.remindAt.getTime();
    await call(u, 'PATCH', '/api/me', { timezone: 'Asia/Tokyo' });
    const after = (await reminders(t.id))[0]!.remindAt.getTime();
    expect(after).not.toBe(before);
  });
});

describe('keeping reminders in sync with the task', () => {
  it('reschedules when the due date changes, and keeps the job otherwise', async () => {
    const u = await signUp(app);
    const t = await createTask(u, { title: 'A', dueAt: iso(inMinutes(600)) });
    const first = (await reminders(t.id))[0]!;

    await call(u, 'PATCH', `/api/tasks/${t.id}`, { title: 'Renamed' });
    expect((await reminders(t.id))[0]!.jobId).toBe(first.jobId);

    const later = inMinutes(900);
    await call(u, 'PATCH', `/api/tasks/${t.id}`, { dueAt: iso(later) });
    const moved = (await reminders(t.id))[0]!;
    expect(moved.remindAt.getTime()).toBe(later.getTime() - HOUR);
    expect((await job(first.jobId))!.state).toBe('cancelled');
    expect((await job(moved.jobId))!.startAfter.getTime()).toBe(moved.remindAt.getTime());
  });

  it('cancels the jobs when the task is deleted', async () => {
    const u = await signUp(app);
    const t = await createTask(u, { title: 'A', dueAt: iso(inMinutes(600)) });
    const jobId = (await reminders(t.id))[0]!.jobId;
    await call(u, 'DELETE', `/api/tasks/${t.id}`);
    expect((await job(jobId))!.state).toBe('cancelled');
  });

  it('cancels on completion and schedules the next occurrence', async () => {
    const u = await signUp(app);
    const t = await createTask(u, {
      title: 'Daily',
      dueAt: iso(inMinutes(120)),
      recurrence: 'DAILY',
    });
    const jobId = (await reminders(t.id))[0]!.jobId;
    const { next } = (await call(u, 'POST', `/api/tasks/${t.id}/complete`)).json();

    expect((await job(jobId))!.state).toBe('cancelled');
    expect(await reminders(t.id)).toEqual([]);
    const nextReminder = (await reminders(next.id))[0]!;
    expect(nextReminder.remindAt.getTime()).toBe(new Date(next.dueAt).getTime() - HOUR);
    expect(next.nextReminderAt).toBe(iso(nextReminder.remindAt));
  });

  it('brings reminders back when a task is reopened', async () => {
    const u = await signUp(app);
    const t = await createTask(u, { title: 'A', dueAt: iso(inMinutes(600)) });
    await call(u, 'POST', `/api/tasks/${t.id}/complete`);
    const reopened: Task = (await call(u, 'POST', `/api/tasks/${t.id}/reopen`)).json();
    const r = (await reminders(t.id))[0]!;
    expect((await job(r.jobId))!.state).toBe('created');
    expect(reopened.nextReminderAt).toBe(iso(r.remindAt));
  });

  it('schedules a snooze as a one-off reminder', async () => {
    const u = await signUp(app);
    const t = await createTask(u, { title: 'A', priority: 'LOW' });
    const snoozed: Task = (
      await call(u, 'POST', `/api/tasks/${t.id}/snooze`, { option: '1h' })
    ).json();
    const [r] = await reminders(t.id);
    expect(r).toMatchObject({ minutesBefore: null, sentAt: null });
    expect((await job(r!.jobId))!.startAfter.toISOString()).toBe(snoozed.nextReminderAt);
  });
});

describe('handleReminder', () => {
  it('delivers in-app and queues push (per subscription) and email', async () => {
    const u = await signUp(app, { timezone: 'Europe/London' });
    await prisma.user.update({ where: { id: u.id }, data: { notifyPush: true } });
    await prisma.pushSubscription.createMany({
      data: [
        { userId: u.id, endpoint: 'https://push.example/a', p256dh: 'k', auth: 'a' },
        { userId: u.id, endpoint: 'https://push.example/b', p256dh: 'k', auth: 'a' },
      ],
    });
    const { task, reminder, data } = await dueReminder(u);
    const emitted: [string, ReminderPayload][] = [];
    setRealtimeEmitter((userId, payload) => emitted.push([userId, payload]));

    expect(await handleReminder(data)).toBe('sent');
    expect(emitted).toEqual([
      [u.id, expect.objectContaining({ taskId: task.id, title: 'Call the dentist' })],
    ]);
    expect(await queued(QUEUES.push)).toHaveLength(2);
    expect(await queued(QUEUES.email)).toHaveLength(1);
    const after = await prisma.taskReminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(after.sentAt).not.toBeNull();
  });

  it('only uses the channels the user chose', async () => {
    const u = await signUp(app);
    await prisma.user.update({
      where: { id: u.id },
      data: { notifyInApp: false, notifyEmail: false, notifyPush: false },
    });
    await prisma.pushSubscription.create({
      data: { userId: u.id, endpoint: 'https://push.example/a', p256dh: 'k', auth: 'a' },
    });
    const { data } = await dueReminder(u);
    const emit = vi.fn();
    setRealtimeEmitter(emit);

    await handleReminder(data);
    expect(emit).not.toHaveBeenCalled();
    expect(await queued(QUEUES.push)).toHaveLength(0);
    expect(await queued(QUEUES.email)).toHaveLength(0);
  });

  it('delivers each reminder only once', async () => {
    const u = await signUp(app);
    const { data } = await dueReminder(u);
    const emit = vi.fn();
    setRealtimeEmitter(emit);

    expect(await handleReminder(data)).toBe('sent');
    expect(await handleReminder(data)).toBe('skipped');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(await queued(QUEUES.email)).toHaveLength(1);
  });

  it('skips stale jobs: moved reminder, completed task, deleted reminder, old job format', async () => {
    const u = await signUp(app);
    const emit = vi.fn();
    setRealtimeEmitter(emit);

    const moved = await dueReminder(u);
    await prisma.taskReminder.update({
      where: { id: moved.reminder.id },
      data: { remindAt: inMinutes(60) },
    });
    expect(await handleReminder(moved.data)).toBe('skipped');

    const done = await dueReminder(u, { status: 'COMPLETED' });
    expect(await handleReminder(done.data)).toBe('skipped');

    const deleted = await dueReminder(u);
    await prisma.taskReminder.delete({ where: { id: deleted.reminder.id } });
    expect(await handleReminder(deleted.data)).toBe('skipped');

    const old = {
      taskId: moved.task.id,
      remindAt: moved.data.remindAt,
    } as unknown as ReminderJobData;
    expect(await handleReminder(old)).toBe('skipped');
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('email delivery', () => {
  it("sends the reminder with the due time in the user's timezone", async () => {
    const u = await signUp(app, { timezone: 'Asia/Tokyo' });
    const { task, data } = await dueReminder(u);
    await prisma.task.update({
      where: { id: task.id },
      data: { dueAt: new Date('2030-01-15T03:30:00Z') },
    });
    await deliverEmail(data);

    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: u.email, subject: 'Reminder: Call the dentist' });
    expect(outbox[0]!.text).toContain('Due: Tue 15 Jan, 12:30');
  });

  it('does nothing for a stale reminder or when email is turned off', async () => {
    const u = await signUp(app);
    const { data } = await dueReminder(u);
    await deliverEmail({ ...data, remindAt: iso(inMinutes(5)) });
    await prisma.user.update({ where: { id: u.id }, data: { notifyEmail: false } });
    await deliverEmail(data);
    expect(outbox).toHaveLength(0);
  });
});

describe('push delivery', () => {
  async function setup() {
    const u = await signUp(app);
    await prisma.user.update({ where: { id: u.id }, data: { notifyPush: true } });
    const sub = await prisma.pushSubscription.create({
      data: { userId: u.id, endpoint: 'https://push.example/x', p256dh: 'key', auth: 'secret' },
    });
    const { data } = await dueReminder(u);
    const push: PushJobData = { ...data, subscriptionId: sub.id };
    return { sub, data: push };
  }

  it('sends the reminder to the subscription', async () => {
    const { data } = await setup();
    const send = vi
      .spyOn(webpush, 'sendNotification')
      .mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    await deliverPush(data);
    expect(send).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/x', keys: { p256dh: 'key', auth: 'secret' } },
      expect.stringContaining('"title":"Call the dentist"'),
      expect.objectContaining({ TTL: 3600 }),
    );
  });

  it('forgets expired subscriptions instead of retrying', async () => {
    const { sub, data } = await setup();
    vi.spyOn(webpush, 'sendNotification').mockRejectedValue(
      new webpush.WebPushError('Gone', 410, {}, '', sub.endpoint),
    );
    await expect(deliverPush(data)).resolves.toBeUndefined();
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('throws on other failures so pg-boss retries', async () => {
    const { data } = await setup();
    vi.spyOn(webpush, 'sendNotification').mockRejectedValue(
      new webpush.WebPushError('Server error', 500, {}, '', 'https://push.example/x'),
    );
    await expect(deliverPush(data)).rejects.toThrow('Server error');
    expect(await prisma.pushSubscription.count()).toBe(1);
  });
});

describe('startup catch-up', () => {
  it('queues reminders that came due without being sent', async () => {
    const u = await signUp(app);
    const missed = await dueReminder(u, { title: 'Missed' });
    await dueReminder(u, { title: 'Already sent', sentAt: new Date() });
    await dueReminder(u, { title: 'Done', status: 'COMPLETED' });
    const future = await dueReminder(u, { title: 'Future' });
    await prisma.taskReminder.update({
      where: { id: future.reminder.id },
      data: { remindAt: inMinutes(30) },
    });

    expect(await catchUpMissedReminders()).toBe(1);
    const jobs = await queued(QUEUES.reminder);
    expect(jobs.map((j) => j.data)).toEqual([missed.data]);
  });
});

describe('end to end with workers', () => {
  it('fires a reminder through pg-boss and emails it', { timeout: 30_000 }, async () => {
    await startReminderWorkers();
    const u = await signUp(app);
    // Due in 1 hour and 2 seconds, so the default "1 hour before" reminder fires in ~2 s.
    await createTask(u, { title: 'Stretch', dueAt: iso(new Date(Date.now() + HOUR + 2000)) });

    for (let i = 0; i < 50 && outbox.length === 0; i++)
      await new Promise((r) => setTimeout(r, 500));
    expect(outbox.map((m) => m.subject)).toEqual(['Reminder: Stretch']);
  });
});

describe('Socket.IO', () => {
  it('delivers reminders only to the signed-in user’s sockets', { timeout: 20_000 }, async () => {
    const io = attachSocketServer(app.server);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as { port: number };
    const url = `http://127.0.0.1:${port}`;

    const u = await signUp(app);
    const anonymous = connect(url, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
    });
    const rejected = await new Promise<string>((resolve) =>
      anonymous.on('connect_error', (e) => resolve(e.message)),
    );
    expect(rejected).toBe('UNAUTHENTICATED');
    anonymous.close();

    const client = connect(url, {
      path: '/socket.io',
      transports: ['websocket'],
      extraHeaders: { cookie: u.cookie },
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      client.on('connect', resolve);
      client.on('connect_error', reject);
    });

    const received = new Promise<ReminderPayload>((resolve) => client.on('reminder', resolve));
    const { task, data } = await dueReminder(u);
    await handleReminder(data);
    expect(await received).toMatchObject({ taskId: task.id, title: 'Call the dentist' });

    client.close();
    io.disconnectSockets(true);
  });
});
