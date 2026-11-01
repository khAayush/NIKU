import { CHECKLIST_ITEMS_LIMIT, type Checklist } from '@todo/shared';
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
const call = (
  u: User,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) => request(app, { method, url, cookie: u.cookie, payload });

async function create(u: User, title: string): Promise<Checklist> {
  const res = await call(u, 'POST', '/api/checklists', { title });
  expect(res.statusCode).toBe(201);
  return res.json();
}
const addItem = (u: User, id: string, text: string) =>
  call(u, 'POST', `/api/checklists/${id}/items`, { text });
const all = async (u: User): Promise<Checklist[]> =>
  (await call(u, 'GET', '/api/checklists')).json().items;

describe('checklists', () => {
  it('starts empty, then creates and lists them newest first', async () => {
    const u = await signUp(app);
    expect(await all(u)).toEqual([]);

    const packing = await create(u, '  Packing  ');
    expect(packing).toMatchObject({ title: 'Packing', items: [] });
    const groceries = await create(u, 'Groceries');
    expect((await all(u)).map((c) => c.title)).toEqual(['Groceries', 'Packing']);
    expect(groceries.id).not.toBe(packing.id);
  });

  it('adds items in order, checks them off (they stay), edits and deletes them', async () => {
    const u = await signUp(app);
    const c = await create(u, 'Groceries');
    const milk = (await addItem(u, c.id, ' Milk ')).json();
    expect(milk).toMatchObject({ text: 'Milk', done: false });
    const eggs = (await addItem(u, c.id, 'Eggs')).json();
    const bread = (await addItem(u, c.id, 'Bread')).json();

    const checked = await call(u, 'PATCH', `/api/checklists/${c.id}/items/${milk.id}`, {
      done: true,
    });
    expect(checked.json()).toEqual({ id: milk.id, text: 'Milk', done: true });
    await call(u, 'PATCH', `/api/checklists/${c.id}/items/${eggs.id}`, { text: 'A dozen eggs' });

    // Checked items keep their place.
    expect((await all(u))[0]!.items).toEqual([
      { id: milk.id, text: 'Milk', done: true },
      { id: eggs.id, text: 'A dozen eggs', done: false },
      { id: bread.id, text: 'Bread', done: false },
    ]);

    const unchecked = await call(u, 'PATCH', `/api/checklists/${c.id}/items/${milk.id}`, {
      done: false,
    });
    expect(unchecked.json().done).toBe(false);

    expect((await call(u, 'DELETE', `/api/checklists/${c.id}/items/${eggs.id}`)).statusCode).toBe(
      204,
    );
    expect((await all(u))[0]!.items.map((i) => i.text)).toEqual(['Milk', 'Bread']);
    // New items still go last after a delete.
    await addItem(u, c.id, 'Butter');
    expect((await all(u))[0]!.items.map((i) => i.text)).toEqual(['Milk', 'Bread', 'Butter']);
  });

  it('lists incomplete checklists first and completed ones after', async () => {
    const u = await signUp(app);
    const shopping = await create(u, 'Shopping');
    const milk = (await addItem(u, shopping.id, 'Milk')).json();
    await create(u, 'Empty');
    const trip = await create(u, 'Trip');
    await addItem(u, trip.id, 'Passport');
    expect((await all(u)).map((c) => c.title)).toEqual(['Trip', 'Empty', 'Shopping']);

    // Ticking Shopping's only item completes it: it moves below the others.
    await call(u, 'PATCH', `/api/checklists/${shopping.id}/items/${milk.id}`, { done: true });
    const tripItem = (await all(u)).find((c) => c.id === trip.id)!.items[0]!;
    await call(u, 'PATCH', `/api/checklists/${trip.id}/items/${tripItem.id}`, { done: true });
    expect((await all(u)).map((c) => c.title)).toEqual(['Empty', 'Trip', 'Shopping']);
  });

  it('renames, and deletes a checklist with its items', async () => {
    const u = await signUp(app);
    const c = await create(u, 'Trip');
    await addItem(u, c.id, 'Passport');

    const renamed = await call(u, 'PATCH', `/api/checklists/${c.id}`, { title: 'Holiday' });
    expect(renamed.json()).toMatchObject({ id: c.id, title: 'Holiday' });

    expect((await call(u, 'DELETE', `/api/checklists/${c.id}`)).statusCode).toBe(204);
    expect(await all(u)).toEqual([]);
    expect(await prisma.checklistItem.count()).toBe(0);
  });

  it('validates titles and items', async () => {
    const u = await signUp(app);
    const blank = await call(u, 'POST', '/api/checklists', { title: '   ' });
    expect(blank.statusCode).toBe(400);
    expect(blank.json().error.code).toBe('VALIDATION_ERROR');
    expect((await call(u, 'POST', '/api/checklists', { title: 'x'.repeat(101) })).statusCode).toBe(
      400,
    );

    const c = await create(u, 'List');
    expect((await addItem(u, c.id, '')).statusCode).toBe(400);
    expect((await addItem(u, c.id, 'x'.repeat(201))).statusCode).toBe(400);
    const item = (await addItem(u, c.id, 'Ok')).json();
    const empty = await call(u, 'PATCH', `/api/checklists/${c.id}/items/${item.id}`, {});
    expect(empty.statusCode).toBe(400);
  });

  it(`refuses more than ${CHECKLIST_ITEMS_LIMIT} items`, async () => {
    const u = await signUp(app);
    const c = await create(u, 'Big');
    await prisma.checklistItem.createMany({
      data: Array.from({ length: CHECKLIST_ITEMS_LIMIT }, (_, i) => ({
        checklistId: c.id,
        text: `Item ${i}`,
        position: i,
      })),
    });
    const res = await addItem(u, c.id, 'One too many');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CHECKLIST_FULL');
  });

  it("returns 404 for other users' checklists and items, and for bad ids", async () => {
    const owner = await signUp(app);
    const other = await signUp(app);
    const c = await create(owner, 'Private');
    const item = (await addItem(owner, c.id, 'Secret')).json();
    const otherList = await create(other, 'Mine');

    expect(await all(other)).toHaveLength(1);
    for (const [method, url, payload] of [
      ['PATCH', `/api/checklists/${c.id}`, { title: 'Hacked' }],
      ['DELETE', `/api/checklists/${c.id}`],
      ['POST', `/api/checklists/${c.id}/items`, { text: 'Hi' }],
      ['PATCH', `/api/checklists/${c.id}/items/${item.id}`, { done: true }],
      ['DELETE', `/api/checklists/${c.id}/items/${item.id}`],
      // Their own checklist id with someone else's item.
      ['PATCH', `/api/checklists/${otherList.id}/items/${item.id}`, { done: true }],
      ['PATCH', '/api/checklists/not-a-uuid', { title: 'X' }],
      ['DELETE', `/api/checklists/${c.id}/items/not-a-uuid`],
    ] as const) {
      const res = await call(other, method, url, payload);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    expect((await all(owner))[0]).toMatchObject({
      title: 'Private',
      items: [{ text: 'Secret', done: false }],
    });
  });

  it('requires a session', async () => {
    const res = await request(app, { method: 'GET', url: '/api/checklists' });
    expect(res.statusCode).toBe(401);
  });
});
