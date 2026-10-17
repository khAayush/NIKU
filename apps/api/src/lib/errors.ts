import type { FastifyError, FastifyInstance } from 'fastify';
import type { ApiError } from '@todo/shared';
import { ZodError } from 'zod';

/** Throw from routes/services to return a specific status and error code. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);

function body(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

/** Makes every error response use the `{ error: { code, message, details? } }` shape. */
export function registerErrorHandlers(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | AppError | ZodError, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(body(err.code, err.message, err.details));
    }
    if (err instanceof ZodError) {
      return reply.status(400).send(body('VALIDATION_ERROR', 'Invalid request', err.issues));
    }
    const statusCode = err.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err }, 'Unhandled error');
      return reply.status(500).send(body('INTERNAL_ERROR', 'Something went wrong'));
    }
    // Fastify's own 4xx errors (bad JSON, body too large, ...).
    const code = statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST';
    return reply.status(statusCode).send(body(code, err.message));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(body('NOT_FOUND', `Route ${request.method} ${request.url} not found`));
  });
}
