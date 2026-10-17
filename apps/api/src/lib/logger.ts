import { pino, type LoggerOptions } from 'pino';
import { env } from './env.js';

function options(): LoggerOptions {
  if (env.NODE_ENV === 'test') return { level: 'silent' };
  if (env.NODE_ENV === 'development') {
    return { level: env.LOG_LEVEL, transport: { target: 'pino-pretty' } };
  }
  return { level: env.LOG_LEVEL }; // JSON lines in production
}

/** App-wide logger; Fastify uses the same instance so all logs share one format. */
export const logger = pino(options());
