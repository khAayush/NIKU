import { buildApp } from './app.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { verifyMailer } from './lib/mailer.js';
import { prisma } from './lib/prisma.js';
import { attachSocketServer } from './reminders/socket.js';
import { catchUpMissedReminders, startReminderWorkers } from './reminders/workers.js';

// Anything that escapes a handler is logged in the same structured format, then the process
// exits so Docker restarts it in a clean state.
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'Unhandled promise rejection');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

const app = await buildApp();
const io = attachSocketServer(app.server);

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal} received, shutting down`);
  try {
    // End Socket.IO connections first (including pending long-polling requests), otherwise the
    // HTTP server waits for them and Docker has to kill the process.
    io.disconnectSockets(true);
    io.engine.close();
    await app.close(); // closes the HTTP server, then stops pg-boss (onClose hook)
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await startReminderWorkers();
  // Reminders that came due while the server was down are sent now instead of being skipped.
  await catchUpMissedReminders();
  await app.listen({ port: env.PORT, host: env.HOST });
  void verifyMailer();
} catch (err) {
  app.log.fatal({ err }, 'Failed to start server');
  process.exit(1);
}
