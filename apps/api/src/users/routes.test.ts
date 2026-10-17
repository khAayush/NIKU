import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { request, resetState, signUp, type TestApp } from '../../test/helpers.js';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());
beforeEach(resetState);

describe('/api/me', () => {
  it("returns only the caller's own profile", async () => {
    const ana = await signUp(app, { name: 'Ana' });
    await signUp(app, { name: 'Ben' });
    const res = await request(app, { method: 'GET', url: '/api/me', cookie: ana.cookie });
    expect(res.json()).toMatchObject({ id: ana.id, name: 'Ana', email: ana.email });
  });

  it('updates name and timezone', async () => {
    const user = await signUp(app);
    const res = await request(app, {
      method: 'PATCH',
      url: '/api/me',
      cookie: user.cookie,
      payload: { name: 'New Name', timezone: 'Asia/Tokyo' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'New Name', timezone: 'Asia/Tokyo' });
  });

  it('rejects an unknown timezone', async () => {
    const user = await signUp(app);
    const res = await request(app, {
      method: 'PATCH',
      url: '/api/me',
      cookie: user.cookie,
      payload: { timezone: 'Nowhere/Land' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('ignores fields that cannot be changed here', async () => {
    const user = await signUp(app);
    const res = await request(app, {
      method: 'PATCH',
      url: '/api/me',
      cookie: user.cookie,
      payload: { email: 'hijack@example.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe(user.email);
  });

  it('does not expose Better Auth update-user', async () => {
    const user = await signUp(app);
    const res = await request(app, {
      method: 'POST',
      url: '/api/auth/update-user',
      cookie: user.cookie,
      payload: { timezone: 'Nowhere/Land' },
    });
    expect(res.statusCode).toBe(404);
  });
});
