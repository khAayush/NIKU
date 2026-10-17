import type { Server as HttpServer } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import { Server } from 'socket.io';
import { auth } from '../auth/auth.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { setRealtimeEmitter } from './deliver.js';

/**
 * Socket.IO for in-app reminders. A connection is accepted only with a valid session cookie;
 * each socket joins its user's room, and reminders are emitted to that room as `reminder`.
 */
export function attachSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    cors: { origin: env.WEB_ORIGIN, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(socket.request.headers),
      });
      if (!session) return next(new Error('UNAUTHENTICATED'));
      socket.data.userId = session.user.id;
      next();
    } catch (err) {
      logger.error({ err }, 'Socket authentication failed');
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    void socket.join(`user:${socket.data.userId}`);
  });

  setRealtimeEmitter((userId, payload) => io.to(`user:${userId}`).emit('reminder', payload));
  return io;
}
