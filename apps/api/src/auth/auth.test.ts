import { meSchema } from '@todo/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { env } from '../lib/env.js';
import { outbox } from '../lib/mailer.js';
import { prisma } from '../lib/prisma.js';
import {
  cookieFrom,
  newUser,
  request,
  resetState,
  signUp,
  type TestApp,
} from '../../test/helpers.js';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());
beforeEach(resetState);

const signIn = (app: TestApp, email: string, password: string) =>
  request(app, { method: 'POST', url: '/api/auth/sign-in/email', payload: { email, password } });

const me = (cookie?: string) => request(app, { method: 'GET', url: '/api/me', cookie });

describe('sign up', () => {
  it('creates the user with their timezone and starts a session', async () => {
    const res = await request(app, {
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: newUser({ timezone: 'America/New_York' }),
    });
    expect(res.statusCode).toBe(200);

    const session = res.cookies.find((c) => c.name.endsWith('session_token'));
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax' });

    const profile = meSchema.parse((await me(cookieFrom(res))).json());
    expect(profile.timezone).toBe('America/New_York');
    expect(profile).toMatchObject({ notifyInApp: true, notifyPush: false, notifyEmail: true });
  });

  it('hashes the password with Argon2id', async () => {
    const user = await signUp(app);
    const account = await prisma.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.password).toMatch(/^\$argon2id\$/);
  });

  it.each([
    ['a short password', { password: 'short' }],
    ['an unknown timezone', { timezone: 'Mars/Olympus' }],
    ['an invalid email', { email: 'not-an-email' }],
    ['an empty name', { name: '  ' }],
  ])('rejects %s with VALIDATION_ERROR', async (_, overrides) => {
    const res = await request(app, {
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: newUser(overrides),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('sign in / sign out', () => {
  it('signs in with the right password', async () => {
    const user = await signUp(app);
    const res = await signIn(app, user.email, user.password);
    expect(res.statusCode).toBe(200);
    expect((await me(cookieFrom(res))).statusCode).toBe(200);
  });

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    const user = await signUp(app);
    const wrongPassword = await signIn(app, user.email, 'wrong password!');
    const unknownEmail = await signIn(app, 'nobody@example.com', 'whatever123');

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({
        error: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
      });
    }
  });

  it('deletes the session on the server when signing out', async () => {
    const user = await signUp(app);
    const out = await request(app, {
      method: 'POST',
      url: '/api/auth/sign-out',
      cookie: user.cookie,
    });
    expect(out.statusCode).toBe(200);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    // The old cookie no longer works even if a client keeps it.
    expect((await me(user.cookie)).statusCode).toBe(401);
  });

  it('rejects protected routes without a session', async () => {
    const res = await me();
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an expired session', async () => {
    const user = await signUp(app);
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await me(user.cookie)).statusCode).toBe(401);
  });
});

describe('rate limiting', () => {
  it('limits sign-in attempts per email', async () => {
    const user = await signUp(app);
    for (let i = 0; i < 10; i++) await signIn(app, user.email, 'wrong password!');
    const res = await signIn(app, user.email, user.password);
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits sign-in attempts per IP across different emails', async () => {
    for (let i = 0; i < 30; i++) await signIn(app, `someone${i}@example.com`, 'whatever123');
    expect((await signIn(app, 'another@example.com', 'whatever123')).statusCode).toBe(429);
  });

  it('limits password reset requests per email', async () => {
    const user = await signUp(app);
    const ask = () =>
      request(app, {
        method: 'POST',
        url: '/api/auth/request-password-reset',
        payload: { email: user.email },
      });
    for (let i = 0; i < 3; i++) expect((await ask()).statusCode).toBe(200);
    expect((await ask()).statusCode).toBe(429);
  });

  it('limits sign-ups per IP', async () => {
    for (let i = 0; i < 10; i++) await signUp(app);
    const res = await request(app, {
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: newUser(),
    });
    expect(res.statusCode).toBe(429);
  });
});

describe('password reset', () => {
  async function requestReset(email: string) {
    const res = await request(app, {
      method: 'POST',
      url: '/api/auth/request-password-reset',
      payload: { email },
    });
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 10)); // email is sent in the background
    const mail = outbox.find((m) => m.to === email);
    const token = mail?.text.match(/reset-password\?token=([^\s]+)/)?.[1];
    return token ? decodeURIComponent(token) : undefined;
  }

  const reset = (token: string, newPassword = 'a brand new password') =>
    request(app, {
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, newPassword },
    });

  it('emails a link, resets the password and signs out every session', async () => {
    const user = await signUp(app);
    const otherDevice = cookieFrom(await signIn(app, user.email, user.password));

    const token = await requestReset(user.email);
    expect(token).toBeTruthy();
    const mail = outbox.find((m) => m.to === user.email)!;
    expect(mail.subject).toBe(`Reset your ${env.APP_NAME} password`);
    expect(mail.html).toContain('Choose a new password');
    expect(mail.html).toContain('Please do not reply to this email');

    expect((await reset(token!)).statusCode).toBe(200);
    expect((await me(user.cookie)).statusCode).toBe(401);
    expect((await me(otherDevice)).statusCode).toBe(401);
    expect((await signIn(app, user.email, user.password)).statusCode).toBe(401);
    expect((await signIn(app, user.email, 'a brand new password')).statusCode).toBe(200);
  });

  it('stores the token hashed, not in plain text', async () => {
    const user = await signUp(app);
    const token = await requestReset(user.email);
    const rows = await prisma.verification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.identifier).not.toContain(token);
  });

  it('expires the link after about 30 minutes', async () => {
    const user = await signUp(app);
    await requestReset(user.email);
    const row = await prisma.verification.findFirstOrThrow();
    const minutes = (row.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
  });

  it('rejects an expired link', async () => {
    const user = await signUp(app);
    const token = await requestReset(user.email);
    await prisma.verification.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await reset(token!)).statusCode).toBe(400);
  });

  it('only works once', async () => {
    const user = await signUp(app);
    const token = await requestReset(user.email);
    expect((await reset(token!)).statusCode).toBe(200);
    expect((await reset(token!, 'yet another password')).statusCode).toBe(400);
  });

  it('answers the same way for unknown emails and sends nothing', async () => {
    const res = await request(app, {
      method: 'POST',
      url: '/api/auth/request-password-reset',
      payload: { email: 'nobody@example.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(outbox).toHaveLength(0);
  });
});

describe('delete account', () => {
  const del = (cookie: string, password: string) =>
    request(app, { method: 'POST', url: '/api/auth/delete-user', cookie, payload: { password } });

  it('requires the correct password', async () => {
    const user = await signUp(app);
    expect((await del(user.cookie, 'wrong password!')).statusCode).toBe(400);
    expect(await prisma.user.count()).toBe(1);
  });

  it('deletes the user and all their data', async () => {
    const user = await signUp(app);
    const other = await signUp(app);
    const list = await prisma.list.create({ data: { userId: user.id, name: 'Work' } });
    await prisma.task.create({ data: { userId: user.id, listId: list.id, title: 'Mine' } });
    await prisma.task.create({ data: { userId: other.id, title: 'Theirs' } });

    expect((await del(user.cookie, user.password)).statusCode).toBe(200);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.task.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.list.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.task.count({ where: { userId: other.id } })).toBe(1);
  });
});
