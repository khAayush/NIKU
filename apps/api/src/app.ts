import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { healthRoutes } from './health/routes.js';
import { env } from './lib/env.js';
import { registerErrorHandlers } from './lib/errors.js';

function loggerOptions(): FastifyServerOptions['logger'] {
  if (env.NODE_ENV === 'test') return false;
  if (env.NODE_ENV === 'development') {
    return { level: env.LOG_LEVEL, transport: { target: 'pino-pretty' } };
  }
  return { level: env.LOG_LEVEL }; // JSON lines in production
}

/** Builds the Fastify app without listening, so tests can use `app.inject`. */
export async function buildApp() {
  const app = Fastify({
    logger: loggerOptions(),
    bodyLimit: 100 * 1024, // 100 KB is plenty for task JSON
  });

  await app.register(helmet);
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  registerErrorHandlers(app);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
