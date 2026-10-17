import { buildApp } from './app.js';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';

const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error({ err }, 'Failed to start server');
  process.exit(1);
}
