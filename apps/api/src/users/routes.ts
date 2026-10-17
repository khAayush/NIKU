import { updateMeSchema } from '@todo/shared';
import type { FastifyInstance } from 'fastify';
import { currentUser } from '../auth/authenticate.js';
import { getMe, updateMe } from './service.js';

/** Profile and settings of the signed-in user. Registered inside the authenticated scope. */
export async function userRoutes(app: FastifyInstance) {
  app.get('/me', async (request) => getMe(currentUser(request).id));

  app.patch('/me', async (request) => {
    const input = updateMeSchema.parse(request.body);
    return updateMe(currentUser(request).id, input);
  });
}
