import { listInputSchema } from '@todo/shared';
import type { FastifyInstance } from 'fastify';
import { currentUser } from '../auth/authenticate.js';
import { parseId } from '../lib/params.js';
import { createList, deleteList, listLists, renameList } from './service.js';

export async function listRoutes(app: FastifyInstance) {
  app.get('/lists', async (request) => ({ items: await listLists(currentUser(request).id) }));

  app.post('/lists', async (request, reply) => {
    const { name } = listInputSchema.parse(request.body);
    return reply.status(201).send(await createList(currentUser(request).id, name));
  });

  app.patch('/lists/:id', async (request) => {
    const id = parseId(request.params, 'List not found');
    const { name } = listInputSchema.parse(request.body);
    return renameList(currentUser(request).id, id, name);
  });

  app.delete('/lists/:id', async (request, reply) => {
    await deleteList(currentUser(request).id, parseId(request.params, 'List not found'));
    return reply.status(204).send();
  });
}
