import {
  deleteAccountSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '@todo/shared';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';
import { auth } from './auth.js';
import { authPath, authRateLimit } from './rate-limit.js';

/** Bodies are validated with the shared schemas first, so clients get our standard VALIDATION_ERROR. */
const BODY_SCHEMAS: Record<string, ZodType> = {
  '/sign-up/email': signUpSchema,
  '/sign-in/email': signInSchema,
  '/request-password-reset': requestPasswordResetSchema,
  '/reset-password': resetPasswordSchema,
  '/delete-user': deleteAccountSchema,
};

/** Mounts Better Auth's handler at /api/auth/* (sign-up, sign-in, sign-out, reset, delete-user...). */
export async function authRoutes(app: FastifyInstance) {
  app.route({
    method: ['GET', 'POST'],
    url: '/auth/*',
    preHandler: [
      authRateLimit,
      async (request) => {
        const schema = request.method === 'POST' ? BODY_SCHEMAS[authPath(request.url)] : undefined;
        if (!schema) return;
        const result = schema.safeParse(request.body);
        if (!result.success) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request', result.error.issues);
        }
      },
    ],
    handler: async (request, reply) => {
      const req = new Request(new URL(request.url, env.WEB_ORIGIN), {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });
      const res = await auth.handler(req);

      reply.status(res.status);
      res.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value);
      });
      const cookies = res.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);

      const text = await res.text();
      if (res.status < 400) return reply.send(text || null);

      // Re-shape Better Auth's `{ code, message }` errors into our `{ error: { code, message } }`.
      let code = res.status === 429 ? 'RATE_LIMITED' : 'AUTH_ERROR';
      let message = res.statusText || 'Request failed';
      try {
        const body = JSON.parse(text) as { code?: string; message?: string };
        code = body.code ?? code;
        message = body.message ?? message;
      } catch {
        // Empty or non-JSON error body: keep the defaults.
      }
      return reply.type('application/json').send({ error: { code, message } });
    },
  });
}
