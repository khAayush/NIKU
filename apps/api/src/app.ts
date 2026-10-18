import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import { authenticate } from './auth/authenticate.js';
import { authRoutes } from './auth/routes.js';
import { healthRoutes } from './health/routes.js';
import { env } from './lib/env.js';
import { AppError, registerErrorHandlers } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { listRoutes } from './lists/routes.js';
import { parseRoutes } from './parse/routes.js';
import { pushRoutes } from './push/routes.js';
import { stopBoss } from './reminders/queue.js';
import { taskRoutes } from './tasks/routes.js';
import { userRoutes } from './users/routes.js';

/** Builds the Fastify app without listening, so tests can use `app.inject`. */
export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    bodyLimit: 100 * 1024, // 100 KB is plenty for task JSON
    requestTimeout: 30_000,
    // In production the API is only reachable through Caddy, which sets X-Forwarded-For.
    // Trust exactly that one hop, so request.ip (used for rate limits) is the real client.
    trustProxy: env.NODE_ENV === 'production' ? (_address: string, hop: number) => hop < 1 : false,
  });

  await app.register(helmet);
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  registerErrorHandlers(app);
  app.decorateRequest('user', null);

  // CSRF defense in depth (on top of SameSite=Lax cookies): browsers send an Origin header on
  // state-changing requests, so reject any from another site. Non-browser clients (no Origin)
  // are unaffected.
  app.addHook('onRequest', async (request) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS')
      return;
    const origin = request.headers.origin;
    if (origin && origin !== env.WEB_ORIGIN) {
      throw new AppError(403, 'FORBIDDEN_ORIGIN', 'Requests from this origin are not allowed');
    }
  });
  app.addHook('onClose', stopBoss);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);

      // Everything registered in here requires a signed-in user.
      await api.register(async (protectedApi) => {
        protectedApi.addHook('preHandler', authenticate);
        await protectedApi.register(userRoutes);
        await protectedApi.register(listRoutes);
        await protectedApi.register(parseRoutes);
        await protectedApi.register(pushRoutes);
        await protectedApi.register(taskRoutes);
      });
    },
    { prefix: '/api' },
  );

  return app;
}
