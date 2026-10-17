import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { authLimiter } from '../src/auth/rate-limit.js';
import { outbox } from '../src/lib/mailer.js';
import { prisma } from '../src/lib/prisma.js';
import { getBoss } from '../src/reminders/queue.js';

export type TestApp = Awaited<ReturnType<typeof buildApp>>;

export const ORIGIN = 'http://localhost:5173';

/** Empties every table and in-memory state so each test starts clean. */
export async function resetState() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "task", "list", "push_subscription", "session", "account", "verification", "user" CASCADE',
  );
  await (await getBoss()).deleteAllJobs();
  authLimiter.reset();
  outbox.length = 0;
}

/** Like app.inject, but sends the Origin header Better Auth expects from browsers. */
export function request(app: TestApp, opts: InjectOptions & { cookie?: string }) {
  const { cookie, headers, ...rest } = opts;
  return app.inject({
    ...rest,
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}), ...headers },
  });
}

/** "name=value; name2=value2" from a response's Set-Cookie headers, for use in later requests. */
export function cookieFrom(res: LightMyRequestResponse) {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

let counter = 0;
export function newUser(
  overrides: Partial<Record<'name' | 'email' | 'password' | 'timezone', string>> = {},
) {
  counter++;
  return {
    name: `User ${counter}`,
    email: `user${counter}@example.com`,
    password: 'correct horse battery',
    timezone: 'Europe/London',
    ...overrides,
  };
}

/** Signs up a new user and returns their details and session cookie. */
export async function signUp(app: TestApp, overrides: Parameters<typeof newUser>[0] = {}) {
  const user = newUser(overrides);
  const res = await request(app, { method: 'POST', url: '/api/auth/sign-up/email', payload: user });
  if (res.statusCode !== 200) throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`);
  return { ...user, id: res.json().user.id as string, cookie: cookieFrom(res) };
}
