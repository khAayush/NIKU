import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';

interface Rule {
  max: number;
  windowMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Limits per Better Auth path, counted separately per client IP and per email address. */
const RULES: Record<string, { ip: Rule; email?: Rule }> = {
  '/sign-in/email': {
    ip: { max: 30, windowMs: 15 * MINUTE },
    email: { max: 10, windowMs: 15 * MINUTE },
  },
  '/sign-up/email': { ip: { max: 10, windowMs: HOUR }, email: { max: 5, windowMs: HOUR } },
  '/request-password-reset': {
    ip: { max: 10, windowMs: HOUR },
    email: { max: 3, windowMs: HOUR },
  },
  '/reset-password': { ip: { max: 10, windowMs: HOUR } },
};

/**
 * Fixed-window counters kept in memory. Fine for a single API process;
 * counters reset when the server restarts.
 */
class FixedWindowLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  /** Counts a hit. Returns seconds until retry when over the limit, otherwise null. */
  consume(key: string, rule: Rule, now = Date.now()): number | null {
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + rule.windowMs };
      this.hits.set(key, entry);
    }
    entry.count++;
    return entry.count > rule.max ? Math.ceil((entry.resetAt - now) / 1000) : null;
  }

  sweep(now = Date.now()) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }

  reset() {
    this.hits.clear();
  }
}

export const authLimiter = new FixedWindowLimiter();
setInterval(() => authLimiter.sweep(), 10 * MINUTE).unref();

/** Path inside Better Auth, e.g. "/api/auth/sign-in/email?x=1" -> "/sign-in/email". */
export function authPath(url: string) {
  return new URL(url, 'http://localhost').pathname.replace(/^\/api\/auth/, '');
}

/** preHandler for /api/auth/*: rejects with 429 when the IP or the email is over its limit. */
export async function authRateLimit(request: FastifyRequest, reply: FastifyReply) {
  if (request.method !== 'POST') return;
  const path = authPath(request.url);
  const rule = RULES[path];
  if (!rule) return;

  const checks: [string, Rule][] = [[`ip:${request.ip}:${path}`, rule.ip]];
  const email = (request.body as { email?: unknown } | undefined)?.email;
  if (rule.email && typeof email === 'string') {
    checks.push([`email:${email.trim().toLowerCase()}:${path}`, rule.email]);
  }

  // Count every key (no short-circuit), so one counter can't be dodged via the other.
  const retryAfter = Math.max(...checks.map(([key, r]) => authLimiter.consume(key, r) ?? 0));
  if (retryAfter > 0) {
    reply.header('Retry-After', String(retryAfter));
    throw new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please try again later.');
  }
}
