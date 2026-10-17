import { parseTaskResponseSchema } from '@todo/shared';
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
const parse = (u: User, text: unknown) =>
  request(app, { method: 'POST', url: '/api/tasks/parse', cookie: u.cookie, payload: { text } });

describe('POST /api/tasks/parse', () => {
  it("returns a draft in the user's timezone and saves nothing", async () => {
    const tz = 'Asia/Tokyo';
    const u = await signUp(app, { timezone: tz });
    const res = await parse(u, 'Submit report tomorrow at 5pm urgent');
    expect(res.statusCode).toBe(200);
    const body = parseTaskResponseSchema.parse(res.json());

    const expected = DateTime.now()
      .setZone(tz)
      .plus({ days: 1 })
      .set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
    expect(body.draft).toMatchObject({
      title: 'Submit report',
      dueAt: expected.toUTC().toISO(),
      dueAllDay: false,
      priority: 'HIGH',
      recurrence: 'NONE',
      listId: null,
    });
    expect(body.recognized).toEqual(['tomorrow at 5pm', 'urgent']);
    expect(await prisma.task.count()).toBe(0);
  });

  it("recognizes the user's own list names only", async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    const list = await prisma.list.create({ data: { userId: a.id, name: 'Groceries' } });

    expect((await parse(a, 'Buy eggs for groceries')).json().draft).toMatchObject({
      title: 'Buy eggs',
      listId: list.id,
    });
    expect((await parse(b, 'Buy eggs for groceries')).json().draft.listId).toBeNull();
  });

  it('produces a draft that the create endpoint accepts', async () => {
    const u = await signUp(app);
    const { draft } = (await parse(u, 'Call mom every Sunday 6pm')).json();
    const created = await request(app, {
      method: 'POST',
      url: '/api/tasks',
      cookie: u.cookie,
      payload: draft,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ title: 'Call mom', recurrence: 'WEEKLY' });
  });

  it.each([
    ['empty text', '   '],
    ['too long text', 'x'.repeat(501)],
    ['a non-string', 42],
  ])('rejects %s', async (_, text) => {
    const u = await signUp(app);
    const res = await parse(u, text);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('requires a session', async () => {
    const res = await request(app, {
      method: 'POST',
      url: '/api/tasks/parse',
      payload: { text: 'x' },
    });
    expect(res.statusCode).toBe(401);
  });
});
