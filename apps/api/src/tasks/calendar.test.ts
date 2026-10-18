import { localToUtc, toLocalDate, type Task } from '@todo/shared';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { insertTask, request, resetState, signUp, type TestApp } from '../../test/helpers.js';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());
beforeEach(resetState);

type User = Awaited<ReturnType<typeof signUp>>;
const TZ = 'America/New_York';

const get = (u: User, url: string) => request(app, { method: 'GET', url, cookie: u.cookie });
const post = (u: User, url: string, payload: object = {}) =>
  request(app, { method: 'POST', url, cookie: u.cookie, payload });

async function createTask(u: User, payload: object): Promise<Task> {
  const res = await post(u, '/api/tasks', payload);
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json();
}

const at = (date: string, time: string | null) => localToUtc(date, time, TZ)!.toISOString();

describe('GET /api/tasks/calendar', () => {
  it("counts tasks per local day in the user's timezone", async () => {
    const u = await signUp(app, { timezone: TZ });
    await createTask(u, { title: 'A', dueAt: at('2030-03-02', '09:00') });
    await createTask(u, { title: 'B', dueAt: at('2030-03-02', '23:30') }); // 04:30 UTC next day
    await createTask(u, { title: 'C', dueAt: at('2030-03-03', null), dueAllDay: true });
    const done = await createTask(u, { title: 'D', dueAt: at('2030-03-03', '10:00') });
    await post(u, `/api/tasks/${done.id}/complete`);
    await createTask(u, { title: 'Outside', dueAt: at('2030-04-15', '10:00') });
    await createTask(u, { title: 'Undated', priority: 'LOW' });

    const res = await get(u, '/api/tasks/calendar?from=2030-02-25&to=2030-04-07');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      days: {
        '2030-03-02': { total: 2, completed: 0, overdue: 0 },
        '2030-03-03': { total: 2, completed: 1, overdue: 0 },
      },
    });
  });

  it('marks days that have overdue tasks', async () => {
    const u = await signUp(app, { timezone: TZ });
    const yesterday = DateTime.now().setZone(TZ).minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const today = toLocalDate(new Date(), TZ);
    await insertTask(u.id, { title: 'Late', dueAt: at(yesterday, '08:00') });
    const done = await insertTask(u.id, { title: 'Done late', dueAt: at(yesterday, '09:00') });
    await post(u, `/api/tasks/${done.id}/complete`);
    await createTask(u, { title: 'Today all day', dueAt: at(today, null), dueAllDay: true });

    const from = DateTime.now().setZone(TZ).minus({ days: 3 }).toFormat('yyyy-MM-dd');
    const to = DateTime.now().setZone(TZ).plus({ days: 3 }).toFormat('yyyy-MM-dd');
    const { days } = (await get(u, `/api/tasks/calendar?from=${from}&to=${to}`)).json();
    expect(days[yesterday]).toEqual({ total: 2, completed: 1, overdue: 1 });
    expect(days[today]).toEqual({ total: 1, completed: 0, overdue: 0 });
  });

  it('only counts your own tasks', async () => {
    const a = await signUp(app, { timezone: TZ });
    const b = await signUp(app, { timezone: TZ });
    await createTask(a, { title: 'A', dueAt: at('2030-03-02', '09:00') });
    const res = await get(b, '/api/tasks/calendar?from=2030-03-01&to=2030-03-31');
    expect(res.json()).toEqual({ days: {} });
  });

  it.each([
    ['missing params', ''],
    ['bad date', '?from=2030-02-30&to=2030-03-01'],
    ['reversed range', '?from=2030-03-10&to=2030-03-01'],
    ['range too long', '?from=2030-01-01&to=2030-06-01'],
  ])('rejects %s', async (_, qs) => {
    const u = await signUp(app);
    const res = await get(u, `/api/tasks/calendar${qs}`);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/tasks/day', () => {
  it('lists every task due that local day, including completed ones', async () => {
    const u = await signUp(app, { timezone: TZ });
    const a = await createTask(u, { title: 'Morning', dueAt: at('2030-03-02', '08:00') });
    const b = await createTask(u, {
      title: 'All day',
      dueAt: at('2030-03-02', null),
      dueAllDay: true,
    });
    const c = await createTask(u, { title: 'Late night', dueAt: at('2030-03-02', '23:59') });
    await post(u, `/api/tasks/${c.id}/complete`);
    await createTask(u, { title: 'Next day', dueAt: at('2030-03-03', '00:00') });

    const res = await get(u, '/api/tasks/day?date=2030-03-02');
    const ids = (res.json().items as Task[]).map((t) => t.id);
    expect(ids).toEqual([b.id, a.id, c.id]);
  });

  it('rejects an invalid date', async () => {
    const u = await signUp(app);
    expect((await get(u, '/api/tasks/day?date=tomorrow')).statusCode).toBe(400);
  });
});

describe('POST /api/tasks/:id/snooze', () => {
  it('adds a one-off reminder and leaves the due date and settings reminders alone', async () => {
    const u = await signUp(app, { timezone: TZ });
    const due = new Date(Date.now() + 5 * 3_600_000);
    const t = await createTask(u, { title: 'Call', dueAt: due.toISOString() });

    const before = Date.now();
    const res = await post(u, `/api/tasks/${t.id}/snooze`, { option: '10m' });
    expect(res.statusCode).toBe(200);
    const snoozed: Task = res.json();
    const remind = new Date(snoozed.nextReminderAt!).getTime();
    expect(remind).toBeGreaterThanOrEqual(before + 10 * 60_000 - 1000);
    expect(remind).toBeLessThanOrEqual(Date.now() + 10 * 60_000 + 1000);
    expect(snoozed.dueAt).toBe(t.dueAt);

    const reminders = await prisma.taskReminder.findMany({
      where: { taskId: t.id },
      orderBy: { remindAt: 'asc' },
    });
    expect(reminders.map((r) => r.hoursBefore)).toEqual([null, 1]);
    expect(reminders[1]!.remindAt.getTime()).toBe(due.getTime() - 3_600_000);
  });

  it('replaces an earlier pending snooze', async () => {
    const u = await signUp(app);
    const t = await createTask(u, { title: 'X', priority: 'LOW' });
    await post(u, `/api/tasks/${t.id}/snooze`, { option: '10m' });
    await post(u, `/api/tasks/${t.id}/snooze`, { option: '1h' });
    expect(await prisma.taskReminder.count({ where: { taskId: t.id } })).toBe(1);
  });

  it('tomorrow means 9:00 tomorrow in the user timezone', async () => {
    const u = await signUp(app, { timezone: TZ });
    const t = await createTask(u, { title: 'X', priority: 'LOW' });
    const snoozed: Task = (
      await post(u, `/api/tasks/${t.id}/snooze`, { option: 'tomorrow' })
    ).json();
    const local = DateTime.fromISO(snoozed.nextReminderAt!, { zone: TZ });
    expect(local.toFormat('HH:mm')).toBe('09:00');
    expect(local.toFormat('yyyy-MM-dd')).toBe(
      DateTime.now().setZone(TZ).plus({ days: 1 }).toFormat('yyyy-MM-dd'),
    );
  });

  it('rejects unknown options and completed tasks', async () => {
    const u = await signUp(app);
    const t = await createTask(u, { title: 'X', priority: 'LOW' });
    expect((await post(u, `/api/tasks/${t.id}/snooze`, { option: '5m' })).statusCode).toBe(400);
    await post(u, `/api/tasks/${t.id}/complete`);
    const res = await post(u, `/api/tasks/${t.id}/snooze`, { option: '1h' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('TASK_COMPLETED');
  });

  it("can't snooze another user's task", async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const t = await createTask(a, { title: 'X', priority: 'LOW' });
    expect((await post(b, `/api/tasks/${t.id}/snooze`, { option: '1h' })).statusCode).toBe(404);
  });
});
