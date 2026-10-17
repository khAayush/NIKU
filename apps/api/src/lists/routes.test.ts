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
const createList = (u: User, name: string) =>
  request(app, { method: 'POST', url: '/api/lists', cookie: u.cookie, payload: { name } });

describe('lists', () => {
  it('starts with no lists', async () => {
    const u = await signUp(app);
    const res = await request(app, { method: 'GET', url: '/api/lists', cookie: u.cookie });
    expect(res.json()).toEqual({ items: [] });
  });

  it('creates, lists (with open task counts) and renames', async () => {
    const u = await signUp(app);
    const created = await createList(u, '  Work ');
    expect(created.statusCode).toBe(201);
    const list = created.json();
    expect(list).toMatchObject({ name: 'Work', openTaskCount: 0 });

    await prisma.task.createMany({
      data: [
        { userId: u.id, listId: list.id, title: 'open' },
        { userId: u.id, listId: list.id, title: 'done', status: 'COMPLETED' },
      ],
    });
    const all = await request(app, { method: 'GET', url: '/api/lists', cookie: u.cookie });
    expect(all.json().items).toEqual([{ id: list.id, name: 'Work', openTaskCount: 1 }]);

    const renamed = await request(app, {
      method: 'PATCH',
      url: `/api/lists/${list.id}`,
      cookie: u.cookie,
      payload: { name: 'Office' },
    });
    expect(renamed.json()).toMatchObject({ id: list.id, name: 'Office' });
  });

  it('rejects duplicate names, ignoring case', async () => {
    const u = await signUp(app);
    await createList(u, 'Personal');
    const dup = await createList(u, 'personal');
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('LIST_NAME_TAKEN');
  });

  it('allows the same name for different users', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await createList(a, 'Work');
    expect((await createList(b, 'Work')).statusCode).toBe(201);
  });

  it('rejects empty and over-long names', async () => {
    const u = await signUp(app);
    expect((await createList(u, '   ')).statusCode).toBe(400);
    expect((await createList(u, 'x'.repeat(51))).statusCode).toBe(400);
  });

  it('deleting a list moves its tasks to "no list"', async () => {
    const u = await signUp(app);
    const list = (await createList(u, 'Work')).json();
    const task = await prisma.task.create({
      data: { userId: u.id, listId: list.id, title: 'Keep me' },
    });

    const res = await request(app, {
      method: 'DELETE',
      url: `/api/lists/${list.id}`,
      cookie: u.cookie,
    });
    expect(res.statusCode).toBe(204);
    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.listId).toBeNull();
  });

  it("can't see or change another user's lists", async () => {
    const owner = await signUp(app);
    const other = await signUp(app);
    const list = (await createList(owner, 'Secret')).json();

    const list2 = await request(app, { method: 'GET', url: '/api/lists', cookie: other.cookie });
    expect(list2.json().items).toEqual([]);
    const rename = await request(app, {
      method: 'PATCH',
      url: `/api/lists/${list.id}`,
      cookie: other.cookie,
      payload: { name: 'Mine now' },
    });
    expect(rename.statusCode).toBe(404);
    const del = await request(app, {
      method: 'DELETE',
      url: `/api/lists/${list.id}`,
      cookie: other.cookie,
    });
    expect(del.statusCode).toBe(404);
    expect(await prisma.list.count()).toBe(1);
  });

  it('returns 404 for a malformed id', async () => {
    const u = await signUp(app);
    const res = await request(app, {
      method: 'DELETE',
      url: '/api/lists/not-a-uuid',
      cookie: u.cookie,
    });
    expect(res.statusCode).toBe(404);
  });
});
