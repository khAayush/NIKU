import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@todo/shared';
import { prisma } from '../lib/prisma.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (request, reply) => {
    let database: HealthResponse['database'] = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      request.log.error({ err }, 'Health check: database unreachable');
      database = 'error';
    }
    const res: HealthResponse = {
      status: database === 'ok' ? 'ok' : 'error',
      database,
      time: new Date().toISOString(),
    };
    return reply.status(database === 'ok' ? 200 : 503).send(res);
  });
}
