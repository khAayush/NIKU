import { buildApp } from './app.js';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { attachSocketServer } from './reminders/socket.js';
import { catchUpMissedReminders, startReminderWorkers } from './reminders/workers.js';

const app = await buildApp();
const io = attachSocketServer(app.server);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await io.close(); // also closes the HTTP server
  await app.close(); // stops pg-boss (onClose hook)
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await startReminderWorkers();
  // Reminders that came due while the server was down are sent now instead of being skipped.
  await catchUpMissedReminders();
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error({ err }, 'Failed to start server');
  process.exit(1);
}
