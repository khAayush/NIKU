import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';
import { auth } from './auth.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `authenticate` on protected routes. */
    user: AuthUser | null;
  }
}

/**
 * Resolves the current user for protected routes. This is the single place that decides who is
 * calling: today a session cookie; later also long-lived device tokens (AR glasses).
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const { headers, response } = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
    returnHeaders: true,
  });
  if (!response) throw new AppError(401, 'UNAUTHENTICATED', 'Not signed in');

  // Pass on the refreshed session cookie when Better Auth extended the session.
  const cookies = headers.getSetCookie();
  if (cookies.length) reply.header('set-cookie', cookies);

  const { id, email, name, timezone } = response.user;
  request.user = { id, email, name, timezone };
}

/** The authenticated user; only call inside routes protected by `authenticate`. */
export function currentUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw new AppError(401, 'UNAUTHENTICATED', 'Not signed in');
  return request.user;
}
