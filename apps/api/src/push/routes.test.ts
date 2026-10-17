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
const subscription = (endpoint = 'https://push.example/abc') => ({
  endpoint,
  keys: { p256dh: 'BPublicKey', auth: 'authSecret' },
});
const subscribe = (u: User, payload: object) =>
  request(app, { method: 'POST', url: '/api/push/subscriptions', cookie: u.cookie, payload });

describe('push API', () => {
  it('returns the VAPID public key', async () => {
    const u = await signUp(app);
    const res = await request(app, {
      method: 'GET',
      url: '/api/push/public-key',
      cookie: u.cookie,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().publicKey).toEqual(expect.any(String));
  });

  it('stores a subscription once per endpoint', async () => {
    const u = await signUp(app);
    expect((await subscribe(u, subscription())).statusCode).toBe(204);
    expect((await subscribe(u, subscription())).statusCode).toBe(204);
    expect(await prisma.pushSubscription.count({ where: { userId: u.id } })).toBe(1);
  });

  it('moves a browser to the account that subscribed last', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await subscribe(a, subscription());
    await subscribe(b, subscription());
    const sub = await prisma.pushSubscription.findUniqueOrThrow({
      where: { endpoint: 'https://push.example/abc' },
    });
    expect(sub.userId).toBe(b.id);
  });

  it('unsubscribes only your own subscription', async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await subscribe(a, subscription());
    const del = (u: User) =>
      request(app, {
        method: 'DELETE',
        url: '/api/push/subscriptions',
        cookie: u.cookie,
        payload: { endpoint: 'https://push.example/abc' },
      });
    expect((await del(b)).statusCode).toBe(204);
    expect(await prisma.pushSubscription.count()).toBe(1);
    expect((await del(a)).statusCode).toBe(204);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('validates the subscription', async () => {
    const u = await signUp(app);
    expect((await subscribe(u, { endpoint: 'not a url', keys: {} })).statusCode).toBe(400);
  });

  it('updates notification preferences via /api/me', async () => {
    const u = await signUp(app);
    const res = await request(app, {
      method: 'PATCH',
      url: '/api/me',
      cookie: u.cookie,
      payload: { notifyInApp: false, notifyPush: true, notifyEmail: false },
    });
    expect(res.json()).toMatchObject({ notifyInApp: false, notifyPush: true, notifyEmail: false });
  });
});
