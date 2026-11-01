import {
  checklistInputSchema,
  createChecklistItemSchema,
  updateChecklistItemSchema,
} from '@todo/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../auth/authenticate.js';
import { notFound } from '../lib/errors.js';
import { parseId } from '../lib/params.js';
import {
  addItem,
  createChecklist,
  deleteChecklist,
  deleteItem,
  listChecklists,
  renameChecklist,
  updateItem,
} from './service.js';

const itemParams = z.object({ id: z.uuid(), itemId: z.uuid() });

/** `:id` and `:itemId`; anything that isn't a UUID can't exist, so it's a 404. */
function parseItemParams(params: unknown) {
  const result = itemParams.safeParse(params);
  if (!result.success) throw notFound('Item not found');
  return result.data;
}

export async function checklistRoutes(app: FastifyInstance) {
  app.get('/checklists', async (request) => ({
    items: await listChecklists(currentUser(request).id),
  }));

  app.post('/checklists', async (request, reply) => {
    const { title } = checklistInputSchema.parse(request.body);
    return reply.status(201).send(await createChecklist(currentUser(request).id, title));
  });

  app.patch('/checklists/:id', async (request) => {
    const id = parseId(request.params, 'Checklist not found');
    const { title } = checklistInputSchema.parse(request.body);
    return renameChecklist(currentUser(request).id, id, title);
  });

  app.delete('/checklists/:id', async (request, reply) => {
    await deleteChecklist(currentUser(request).id, parseId(request.params, 'Checklist not found'));
    return reply.status(204).send();
  });

  app.post('/checklists/:id/items', async (request, reply) => {
    const id = parseId(request.params, 'Checklist not found');
    const { text, id: itemId } = createChecklistItemSchema.parse(request.body);
    return reply.status(201).send(await addItem(currentUser(request).id, id, text, itemId));
  });

  app.patch('/checklists/:id/items/:itemId', async (request) => {
    const { id, itemId } = parseItemParams(request.params);
    const input = updateChecklistItemSchema.parse(request.body);
    return updateItem(currentUser(request).id, id, itemId, input);
  });

  app.delete('/checklists/:id/items/:itemId', async (request, reply) => {
    const { id, itemId } = parseItemParams(request.params);
    await deleteItem(currentUser(request).id, id, itemId);
    return reply.status(204).send();
  });
}
