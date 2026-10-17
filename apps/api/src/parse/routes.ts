import { parseTaskRequestSchema, type ParseTaskResponse } from '@todo/shared';
import type { FastifyInstance } from 'fastify';
import { currentUser } from '../auth/authenticate.js';
import { prisma } from '../lib/prisma.js';
import { parseTaskText } from './parser.js';

export async function parseRoutes(app: FastifyInstance) {
  /** Turns a sentence into a task draft. Nothing is saved. */
  app.post('/tasks/parse', async (request): Promise<ParseTaskResponse> => {
    const { text } = parseTaskRequestSchema.parse(request.body);
    const user = currentUser(request);
    const lists = await prisma.list.findMany({
      where: { userId: user.id },
      select: { id: true, name: true },
    });
    const parsed = parseTaskText(text, { now: new Date(), timezone: user.timezone, lists });
    return {
      draft: {
        title: parsed.title,
        notes: null,
        dueAt: parsed.dueAt?.toISOString() ?? null,
        dueAllDay: parsed.dueAllDay,
        remindAt: parsed.remindAt?.toISOString() ?? null,
        priority: parsed.priority,
        recurrence: parsed.recurrence,
        listId: parsed.listId,
      },
      recognized: parsed.recognized,
    };
  });
}
