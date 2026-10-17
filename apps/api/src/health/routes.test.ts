import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@todo/shared';
import { buildApp } from '../app.js';

describe('GET /api/health', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(() => app.close());

  it('reports ok when the database is reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = healthResponseSchema.parse(res.json());
    expect(body).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('returns the standard error shape for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
