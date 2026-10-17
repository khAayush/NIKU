import { createTaskSchema, listTasksQuerySchema, updateTaskSchema } from '@todo/shared';
import type { FastifyInstance } from 'fastify';
import { currentUser } from '../auth/authenticate.js';
import { parseId } from '../lib/params.js';
import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  overdueTasks,
  reopenTask,
  todayTasks,
  updateTask,
} from './service.js';

const taskId = (params: unknown) => parseId(params, 'Task not found');

export async function taskRoutes(app: FastifyInstance) {
  app.get('/tasks', async (request) => {
    const query = listTasksQuerySchema.parse(request.query);
    return { items: await listTasks(currentUser(request), query) };
  });

  app.get('/tasks/today', async (request) => todayTasks(currentUser(request)));

  app.get('/tasks/overdue', async (request) => ({
    items: await overdueTasks(currentUser(request)),
  }));

  app.get('/tasks/:id', async (request) => getTask(currentUser(request), taskId(request.params)));

  app.post('/tasks', async (request, reply) => {
    const input = createTaskSchema.parse(request.body);
    return reply.status(201).send(await createTask(currentUser(request), input));
  });

  app.patch('/tasks/:id', async (request) => {
    const id = taskId(request.params);
    return updateTask(currentUser(request), id, updateTaskSchema.parse(request.body));
  });

  app.delete('/tasks/:id', async (request, reply) => {
    await deleteTask(currentUser(request).id, taskId(request.params));
    return reply.status(204).send();
  });

  app.post('/tasks/:id/complete', async (request) =>
    completeTask(currentUser(request), taskId(request.params)),
  );

  app.post('/tasks/:id/reopen', async (request) =>
    reopenTask(currentUser(request), taskId(request.params)),
  );
}
