import { localDayRange, localToUtc, toLocalDate, type Task } from '@todo/shared';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { request, resetState, signUp, type TestApp } from '../../test/helpers.js';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());
beforeEach(resetState);

type User = Awaited<ReturnType<typeof signUp>>;
const TZ = 'Europe/London';
const HOUR = 3_600_000;
const iso = (d: Date) => d.toISOString();

function api(u: User) {
  return {
    create: (payload: object) =>
      request(app, { method: 'POST', url: '/api/tasks', cookie: u.cookie, payload }),
    get: (id: string) => request(app, { method: 'GET', url: `/api/tasks/${id}`, cookie: u.cookie }),
    update: (id: string, payload: object) =>
      request(app, { method: 'PATCH', url: `/api/tasks/${id}`, cookie: u.cookie, payload }),
    remove: (id: string) =>
      request(app, { method: 'DELETE', url: `/api/tasks/${id}`, cookie: u.cookie }),
    complete: (id: string) =>
      request(app, { method: 'POST', url: `/api/tasks/${id}/complete`, cookie: u.cookie }),
    reopen: (id: string) =>
      request(app, { method: 'POST', url: `/api/tasks/${id}/reopen`, cookie: u.cookie }),
    list: (query = '') =>
      request(app, { method: 'GET', url: `/api/tasks${query}`, cookie: u.cookie }),
    today: () => request(app, { method: 'GET', url: '/api/tasks/today', cookie: u.cookie }),
    overdue: () => request(app, { method: 'GET', url: '/api/tasks/overdue', cookie: u.cookie }),
  };
}

async function createTask(u: User, payload: object): Promise<Task> {
  const res = await api(u).create(payload);
  if (res.statusCode !== 201) throw new Error(`create failed: ${res.body}`);
  return res.json();
}

describe('creating tasks', () => {
  it('creates a task with defaults', async () => {
    const u = await signUp(app, { timezone: TZ });
    const due = new Date(Date.now() + 24 * HOUR);
    const res = await api(u).create({ title: 'Submit report', dueAt: iso(due) });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      title: 'Submit report',
      dueAt: iso(due),
      dueAllDay: false,
      priority: 'MEDIUM',
      recurrence: 'NONE',
      status: 'OPEN',
      listId: null,
      isOverdue: false,
    });
  });

  it('requires a due date unless priority is Low', async () => {
    const u = await signUp(app);
    const res = await api(u).create({ title: 'Someday' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect((await api(u).create({ title: 'Someday', priority: 'LOW' })).statusCode).toBe(201);
  });

  it('rejects titles over 200 characters', async () => {
    const u = await signUp(app);
    const res = await api(u).create({ title: 'x'.repeat(201), priority: 'LOW' });
    expect(res.statusCode).toBe(400);
  });

  it("stores all-day due dates as the start of that day in the user's timezone", async () => {
    const u = await signUp(app, { timezone: 'Asia/Tokyo' });
    // Any instant on 2026-12-05 in Tokyo.
    const t = await createTask(u, {
      title: 'Holiday',
      dueAt: '2026-12-05T05:00:00Z',
      dueAllDay: true,
    });
    expect(t.dueAt).toBe(localToUtc('2026-12-05', null, 'Asia/Tokyo')!.toISOString());
    expect(t.dueAllDay).toBe(true);
  });

  it('stores the reminder as an offset from the due date', async () => {
    const u = await signUp(app);
    const due = new Date(Date.now() + 48 * HOUR);
    const t = await createTask(u, {
      title: 'Call',
      dueAt: iso(due),
      remindAt: iso(new Date(due.getTime() - HOUR)),
    });
    const row = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.reminderOffsetMinutes).toBe(60);
  });

  it('stores the original day of the month for monthly tasks', async () => {
    const u = await signUp(app, { timezone: TZ });
    const due = localToUtc('2027-01-31', '09:00', TZ)!;
    const t = await createTask(u, { title: 'Rent', dueAt: iso(due), recurrence: 'MONTHLY' });
    const row = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.recurrenceDay).toBe(31);
  });

  it("can't use another user's list", async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const list = await prisma.list.create({ data: { userId: a.id, name: 'A' } });
    const res = await api(b).create({ title: 'X', priority: 'LOW', listId: list.id });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_LIST');
  });
});

describe('editing and deleting', () => {
  it('updates only the given fields', async () => {
    const u = await signUp(app);
    const t = await createTask(u, { title: 'Old', priority: 'LOW', notes: 'keep' });
    const res = await api(u).update(t.id, {
      title: 'New',
      priority: 'HIGH',
      dueAt: iso(new Date(Date.now() + HOUR)),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ title: 'New', priority: 'HIGH', notes: 'keep' });
  });

  it('checks the rules against the merged task', async () => {
    const u = await signUp(app);
    const t = await createTask(u, { title: 'Undated', priority: 'LOW' });
    const res = await api(u).update(t.id, { priority: 'MEDIUM' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('keeps the reminder offset when only other fields change', async () => {
    const u = await signUp(app);
    const due = new Date(Date.now() + 48 * HOUR);
    const t = await createTask(u, {
      title: 'A',
      dueAt: iso(due),
      remindAt: iso(new Date(due.getTime() - 2 * HOUR)),
    });
    // Simulate a snooze having moved the reminder.
    await prisma.task.update({
      where: { id: t.id },
      data: { remindAt: new Date(due.getTime() - HOUR) },
    });
    await api(u).update(t.id, { title: 'B' });
    const row = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.reminderOffsetMinutes).toBe(120);
  });

  it('can move a task to "no list"', async () => {
    const u = await signUp(app);
    const list = await prisma.list.create({ data: { userId: u.id, name: 'Work' } });
    const t = await createTask(u, { title: 'A', priority: 'LOW', listId: list.id });
    expect((await api(u).update(t.id, { listId: null })).json().listId).toBeNull();
  });

  it('deletes a task', async () => {
    const u = await signUp(app);
    const t = await createTask(u, { title: 'A', priority: 'LOW' });
    expect((await api(u).remove(t.id)).statusCode).toBe(204);
    expect((await api(u).get(t.id)).statusCode).toBe(404);
  });
});

describe("other users' tasks", () => {
  it('are invisible and unchangeable', async () => {
    const owner = await signUp(app);
    const other = await signUp(app);
    const t = await createTask(owner, { title: 'Private', priority: 'LOW' });
    const o = api(other);

    expect((await o.get(t.id)).statusCode).toBe(404);
    expect((await o.update(t.id, { title: 'Hacked' })).statusCode).toBe(404);
    expect((await o.complete(t.id)).statusCode).toBe(404);
    expect((await o.reopen(t.id)).statusCode).toBe(404);
    expect((await o.remove(t.id)).statusCode).toBe(404);
    expect((await o.list('?status=all')).json().items).toEqual([]);
    expect((await api(owner).get(t.id)).json().title).toBe('Private');
  });
});

describe('completing tasks', () => {
  it('marks complete and incomplete', async () => {
    const u = await signUp(app);
    const t = await createTask(u, { title: 'A', priority: 'LOW' });
    const done = await api(u).complete(t.id);
    expect(done.json()).toMatchObject({ task: { status: 'COMPLETED' }, next: null });
    expect(done.json().task.completedAt).toBeTruthy();

    const reopened = await api(u).reopen(t.id);
    expect(reopened.json()).toMatchObject({ status: 'OPEN', completedAt: null });
  });

  it('creates the next occurrence of a repeating task', async () => {
    const u = await signUp(app, { timezone: TZ });
    const list = await prisma.list.create({ data: { userId: u.id, name: 'Home' } });
    const due = DateTime.now().setZone(TZ).plus({ hours: 2 }).startOf('minute');
    const t = await createTask(u, {
      title: 'Water plants',
      notes: 'Both rooms',
      dueAt: due.toISO(),
      remindAt: due.minus({ minutes: 30 }).toISO(),
      priority: 'HIGH',
      recurrence: 'DAILY',
      listId: list.id,
    });

    const { task, next } = (await api(u).complete(t.id)).json();
    expect(task.status).toBe('COMPLETED');
    expect(next).toMatchObject({
      title: 'Water plants',
      notes: 'Both rooms',
      priority: 'HIGH',
      recurrence: 'DAILY',
      listId: list.id,
      status: 'OPEN',
      dueAt: iso(due.plus({ days: 1 }).toJSDate()),
      remindAt: iso(due.plus({ days: 1 }).minus({ minutes: 30 }).toJSDate()),
    });
  });

  it('creates only one future occurrence when completed late', async () => {
    const u = await signUp(app, { timezone: TZ });
    const due = DateTime.now().setZone(TZ).minus({ days: 5 }).startOf('minute');
    const t = await createTask(u, { title: 'Daily', dueAt: due.toISO(), recurrence: 'DAILY' });

    const { next } = (await api(u).complete(t.id)).json();
    expect(new Date(next.dueAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(next.dueAt).getTime()).toBeLessThanOrEqual(Date.now() + 24 * HOUR);
    expect(await prisma.task.count({ where: { userId: u.id } })).toBe(2);
  });

  it('completing twice does not create a second occurrence', async () => {
    const u = await signUp(app);
    const t = await createTask(u, {
      title: 'Weekly',
      dueAt: iso(new Date(Date.now() + HOUR)),
      recurrence: 'WEEKLY',
    });
    await api(u).complete(t.id);
    const again = await api(u).complete(t.id);
    expect(again.json().next).toBeNull();
    expect(await prisma.task.count({ where: { userId: u.id } })).toBe(2);
  });
});

describe('All tasks and search', () => {
  it('filters by list, status and title', async () => {
    const u = await signUp(app);
    const work = await prisma.list.create({ data: { userId: u.id, name: 'Work' } });
    const a = await createTask(u, { title: 'Submit REPORT', priority: 'LOW', listId: work.id });
    const b = await createTask(u, { title: 'Buy milk', priority: 'LOW' });
    const c = await createTask(u, { title: 'Old report', priority: 'LOW', listId: work.id });
    await api(u).complete(c.id);

    const ids = async (q: string) =>
      ((await api(u).list(q)).json().items as Task[]).map((t) => t.id);
    expect(await ids('')).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(await ids('')).not.toContain(c.id); // open only by default
    expect(await ids(`?listId=${work.id}`)).toEqual([a.id]);
    expect(await ids('?listId=none')).toEqual([b.id]);
    expect(await ids('?status=completed')).toEqual([c.id]);
    expect((await ids('?status=all&q=report')).sort()).toEqual([a.id, c.id].sort());
    expect(await ids('?q=MILK')).toEqual([b.id]);
  });

  it('sorts by due date with undated tasks last', async () => {
    const u = await signUp(app);
    const undated = await createTask(u, { title: 'Undated', priority: 'LOW' });
    const later = await createTask(u, {
      title: 'Later',
      dueAt: iso(new Date(Date.now() + 48 * HOUR)),
    });
    const sooner = await createTask(u, {
      title: 'Sooner',
      dueAt: iso(new Date(Date.now() + HOUR)),
    });
    const ids = ((await api(u).list()).json().items as Task[]).map((t) => t.id);
    expect(ids).toEqual([sooner.id, later.id, undated.id]);
  });

  it('rejects an invalid list filter', async () => {
    const u = await signUp(app);
    expect((await api(u).list('?listId=nope')).statusCode).toBe(400);
  });
});

describe('Today and Overdue', () => {
  it('puts overdue tasks first and includes completed tasks due today', async () => {
    const u = await signUp(app, { timezone: TZ });
    const now = new Date();
    const { end } = localDayRange(now, TZ);
    const todayStr = toLocalDate(now, TZ);
    const yesterdayStr = DateTime.fromJSDate(now)
      .setZone(TZ)
      .minus({ days: 1 })
      .toFormat('yyyy-MM-dd');

    const pastTimed = await createTask(u, {
      title: 'Past timed',
      dueAt: iso(new Date(now.getTime() - 3 * 24 * HOUR)),
    });
    const allDayYesterday = await createTask(u, {
      title: 'All-day yesterday',
      dueAt: iso(localToUtc(yesterdayStr, null, TZ)!),
      dueAllDay: true,
    });
    const allDayToday = await createTask(u, {
      title: 'All-day today',
      dueAt: iso(localToUtc(todayStr, null, TZ)!),
      dueAllDay: true,
    });
    const laterToday = await createTask(u, {
      title: 'Later today',
      dueAt: iso(new Date(Math.max(now.getTime() + 1000, end.getTime() - 1))),
    });
    const doneToday = await createTask(u, {
      title: 'Done today',
      dueAt: iso(new Date(end.getTime() - 2)),
    });
    await api(u).complete(doneToday.id);
    await createTask(u, { title: 'Tomorrow', dueAt: iso(new Date(end.getTime() + HOUR)) });
    await createTask(u, { title: 'Undated', priority: 'LOW' });

    const today = (await api(u).today()).json();
    expect(today.overdue.map((t: Task) => t.id)).toEqual([pastTimed.id, allDayYesterday.id]);
    expect(today.overdue.every((t: Task) => t.isOverdue)).toBe(true);
    expect(today.today.map((t: Task) => t.id).sort()).toEqual(
      [allDayToday.id, laterToday.id, doneToday.id].sort(),
    );

    const overdue = (await api(u).overdue()).json();
    expect(overdue.items.map((t: Task) => t.id)).toEqual([pastTimed.id, allDayYesterday.id]);
  });

  it("uses the user's own timezone for 'today'", async () => {
    // Kiritimati (UTC+14) is always exactly one calendar day ahead of Honolulu (UTC-10).
    const KIRI = 'Pacific/Kiritimati';
    const HONO = 'Pacific/Honolulu';
    const kiri = await signUp(app, { timezone: KIRI });
    const hono = await signUp(app, { timezone: HONO });
    const kiriDate = toLocalDate(new Date(), KIRI);
    const honoDate = toLocalDate(new Date(), HONO);

    // The same calendar date means different things to each user.
    await createTask(kiri, {
      title: 'kiri-date',
      dueAt: iso(localToUtc(kiriDate, null, KIRI)!),
      dueAllDay: true,
    });
    await createTask(kiri, {
      title: 'hono-date',
      dueAt: iso(localToUtc(honoDate, null, KIRI)!),
      dueAllDay: true,
    });
    await createTask(hono, {
      title: 'kiri-date',
      dueAt: iso(localToUtc(kiriDate, null, HONO)!),
      dueAllDay: true,
    });
    await createTask(hono, {
      title: 'hono-date',
      dueAt: iso(localToUtc(honoDate, null, HONO)!),
      dueAllDay: true,
    });

    const titles = (ts: Task[]) => ts.map((t) => t.title);
    const k = (await api(kiri).today()).json();
    expect(titles(k.today)).toEqual(['kiri-date']);
    expect(titles(k.overdue)).toEqual(['hono-date']); // yesterday for Kiritimati
    const h = (await api(hono).today()).json();
    expect(titles(h.today)).toEqual(['hono-date']);
    expect(titles(h.overdue)).toEqual([]); // 'kiri-date' is tomorrow for Honolulu
  });
});
