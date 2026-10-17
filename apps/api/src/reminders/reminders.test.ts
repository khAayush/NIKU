import type { ReminderPayload, Task } from '@todo/shared';
import { io as connect } from 'socket.io-client';
import webpush from 'web-push';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { Prisma } from '../generated/prisma/client.js';
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
const inMinutes = (n: number) => new Date(Date.now() + n * MIN);

const call = (u: User, method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  request(app, { method, url, cookie: u.cookie, payload });

async function createTask(u: User, payload: object): Promise<Task> {
  const res = await call(u, 'POST', '/api/tasks', payload);
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json();
}

const row = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } });

async function job(id: string | null) {
  if (!id) return null;
  const [found] = await (await getBoss()).findJobs<ReminderJobData>(QUEUES.reminder, { id });
  return found ?? null;
}

async function queued(queue: string) {
  return (await getBoss()).findJobs<Record<string, unknown>>(queue, { queued: true });
}

/** Creates a task whose reminder is already due (bypassing the API, so nothing is scheduled). */
function dueTask(u: User, overrides: Partial<Prisma.TaskUncheckedCreateInput> = {}) {
  return prisma.task.create({
    data: {
      userId: u.id,
      title: 'Call the dentist',
      dueAt: inMinutes(30),
      remindAt: inMinutes(-1),
      ...overrides,
    },
  });
}

describe('scheduling', () => {
  it('schedules a job at the reminder time when a task is created', async () => {
    const u = await signUp(app);
    const remindAt = inMinutes(60);
    const t = await createTask(u, {
      title: 'A',
      dueAt: inMinutes(120).toISOString(),
      remindAt: remindAt.toISOString(),
    });

    const j = await job((await row(t.id)).reminderJobId);
    expect(j).toMatchObject({
      state: 'created',
      data: { taskId: t.id, remindAt: remindAt.toISOString() },
    });
    expect(j!.startAfter.getTime()).toBe(remindAt.getTime());
  });

  it('schedules nothing without a reminder', async () => {
    const u = await signUp(app);
    const t = await createTask(u, { title: 'A', priority: 'LOW' });
    expect((await row(t.id)).reminderJobId).toBeNull();
    expect(await queued(QUEUES.reminder)).toHaveLength(0);
  });

  it('reschedules when the reminder is edited, and keeps the job otherwise', async () => {
    const u = await signUp(app);
    const t = await createTask(u, {
      title: 'A',
      priority: 'LOW',
      remindAt: inMinutes(60).toISOString(),
    });
    const firstJob = (await row(t.id)).reminderJobId;

    await call(u, 'PATCH', `/api/tasks/${t.id}`, { title: 'Renamed' });
    expect((await row(t.id)).reminderJobId).toBe(firstJob);

    const newTime = inMinutes(90);
    await call(u, 'PATCH', `/api/tasks/${t.id}`, { remindAt: newTime.toISOString() });
    const updated = await row(t.id);
    expect(updated.reminderJobId).not.toBe(firstJob);
    expect((await job(firstJob))!.state).toBe('cancelled');
    expect((await job(updated.reminderJobId))!.startAfter.getTime()).toBe(newTime.getTime());
  });

  it('cancels the job when the reminder is removed', async () => {
    const u = await signUp(app);
    const t = await createTask(u, {
      title: 'A',
      priority: 'LOW',
      remindAt: inMinutes(60).toISOString(),
    });
    const jobId = (await row(t.id)).reminderJobId;
    await call(u, 'PATCH', `/api/tasks/${t.id}`, { remindAt: null });
    expect((await job(jobId))!.state).toBe('cancelled');
    expect((await row(t.id)).reminderJobId).toBeNull();
  });

  it('cancels the job when the task is deleted', async () => {
    const u = await signUp(app);
    const t = await createTask(u, {
      title: 'A',
      priority: 'LOW',
      remindAt: inMinutes(60).toISOString(),
    });
    const jobId = (await row(t.id)).reminderJobId;
    await call(u, 'DELETE', `/api/tasks/${t.id}`);
    expect((await job(jobId))!.state).toBe('cancelled');
  });

  it('cancels on completion and schedules the next occurrence', async () => {
    const u = await signUp(app);
    const due = inMinutes(120);
    const t = await createTask(u, {
      title: 'Daily',
      dueAt: due.toISOString(),
      remindAt: new Date(due.getTime() - 30 * MIN).toISOString(),
      recurrence: 'DAILY',
    });
    const jobId = (await row(t.id)).reminderJobId;
    const { next } = (await call(u, 'POST', `/api/tasks/${t.id}/complete`)).json();

    expect((await job(jobId))!.state).toBe('cancelled');
    const nextJob = await job((await row(next.id)).reminderJobId);
    expect(nextJob!.startAfter.toISOString()).toBe(next.remindAt);
  });

  it('reschedules when reopened and when snoozed', async () => {
    const u = await signUp(app);
    const t = await createTask(u, {
      title: 'A',
      priority: 'LOW',
      remindAt: inMinutes(60).toISOString(),
    });
    await call(u, 'POST', `/api/tasks/${t.id}/complete`);
    await call(u, 'POST', `/api/tasks/${t.id}/reopen`);
    const reopenedJob = (await row(t.id)).reminderJobId;
    expect((await job(reopenedJob))!.state).toBe('created');

    const snoozed: Task = (
      await call(u, 'POST', `/api/tasks/${t.id}/snooze`, { option: '1h' })
    ).json();
    const after = await row(t.id);
    expect((await job(reopenedJob))!.state).toBe('cancelled');
    expect((await job(after.reminderJobId))!.startAfter.toISOString()).toBe(snoozed.remindAt);
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
    const task = await dueTask(u);
    const emitted: [string, ReminderPayload][] = [];
    setRealtimeEmitter((userId, payload) => emitted.push([userId, payload]));

    const result = await handleReminder({
      taskId: task.id,
      remindAt: task.remindAt!.toISOString(),
    });

    expect(result).toBe('sent');
    expect(emitted).toEqual([
      [u.id, expect.objectContaining({ taskId: task.id, title: 'Call the dentist' })],
    ]);
    expect(await queued(QUEUES.push)).toHaveLength(2);
    expect(await queued(QUEUES.email)).toHaveLength(1);
    expect((await row(task.id)).reminderSentAt).not.toBeNull();
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
    const task = await dueTask(u);
    const emit = vi.fn();
    setRealtimeEmitter(emit);

    await handleReminder({ taskId: task.id, remindAt: task.remindAt!.toISOString() });
    expect(emit).not.toHaveBeenCalled();
    expect(await queued(QUEUES.push)).toHaveLength(0);
    expect(await queued(QUEUES.email)).toHaveLength(0);
  });

  it('delivers each reminder only once', async () => {
    const u = await signUp(app);
    const task = await dueTask(u);
    const emit = vi.fn();
    setRealtimeEmitter(emit);
    const data = { taskId: task.id, remindAt: task.remindAt!.toISOString() };

    expect(await handleReminder(data)).toBe('sent');
    expect(await handleReminder(data)).toBe('skipped');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(await queued(QUEUES.email)).toHaveLength(1);
  });

  it('skips stale jobs: changed reminder, completed or deleted task', async () => {
    const u = await signUp(app);
    const emit = vi.fn();
    setRealtimeEmitter(emit);

    const moved = await dueTask(u);
    const oldTime = moved.remindAt!.toISOString();
    await prisma.task.update({ where: { id: moved.id }, data: { remindAt: inMinutes(60) } });
    expect(await handleReminder({ taskId: moved.id, remindAt: oldTime })).toBe('skipped');

    const done = await dueTask(u, { status: 'COMPLETED', completedAt: new Date() });
    expect(await handleReminder({ taskId: done.id, remindAt: done.remindAt!.toISOString() })).toBe(
      'skipped',
    );

    expect(
      await handleReminder({ taskId: '00000000-0000-4000-8000-000000000000', remindAt: oldTime }),
    ).toBe('skipped');
    expect(emit).not.toHaveBeenCalled();
  });

  it('sends a snoozed reminder again at its new time', async () => {
    const u = await signUp(app);
    const task = await dueTask(u);
    await handleReminder({ taskId: task.id, remindAt: task.remindAt!.toISOString() });

    const snoozed: Task = (
      await call(u, 'POST', `/api/tasks/${task.id}/snooze`, { option: '10m' })
    ).json();
    expect((await row(task.id)).reminderSentAt).toBeNull();
    expect(await handleReminder({ taskId: task.id, remindAt: snoozed.remindAt! })).toBe('sent');
  });
});

describe('email delivery', () => {
  it("sends the reminder with the due time in the user's timezone", async () => {
    const u = await signUp(app, { timezone: 'Asia/Tokyo' });
    const task = await dueTask(u, { dueAt: new Date('2030-01-15T03:30:00Z') });
    await deliverEmail({ taskId: task.id, remindAt: task.remindAt!.toISOString() });

    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: u.email, subject: 'Reminder: Call the dentist' });
    expect(outbox[0]!.text).toContain('Due: Tue 15 Jan, 12:30');
  });

  it('does nothing for a stale reminder or when email is turned off', async () => {
    const u = await signUp(app);
    const task = await dueTask(u);
    await deliverEmail({ taskId: task.id, remindAt: inMinutes(5).toISOString() });
    await prisma.user.update({ where: { id: u.id }, data: { notifyEmail: false } });
    await deliverEmail({ taskId: task.id, remindAt: task.remindAt!.toISOString() });
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
    const task = await dueTask(u);
    const data: PushJobData = {
      taskId: task.id,
      remindAt: task.remindAt!.toISOString(),
      subscriptionId: sub.id,
    };
    return { sub, data };
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
    const missed = await dueTask(u, { title: 'Missed' });
    await dueTask(u, { title: 'Already sent', reminderSentAt: new Date() });
    await dueTask(u, { title: 'Done', status: 'COMPLETED', completedAt: new Date() });
    await dueTask(u, { title: 'Future', remindAt: inMinutes(30) });

    expect(await catchUpMissedReminders()).toBe(1);
    const jobs = await queued(QUEUES.reminder);
    expect(jobs.map((j) => j.data)).toEqual([
      { taskId: missed.id, remindAt: missed.remindAt!.toISOString() },
    ]);
  });
});

describe('end to end with workers', () => {
  it('fires a reminder through pg-boss and emails it', { timeout: 30_000 }, async () => {
    await startReminderWorkers();
    const u = await signUp(app);
    await createTask(u, {
      title: 'Stretch',
      priority: 'LOW',
      remindAt: new Date(Date.now() + 1000).toISOString(),
    });

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
    const task = await dueTask(u);
    await handleReminder({ taskId: task.id, remindAt: task.remindAt!.toISOString() });
    expect(await received).toMatchObject({ taskId: task.id, title: 'Call the dentist' });

    client.close();
    io.disconnectSockets(true);
  });
});
