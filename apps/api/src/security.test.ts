import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { request, resetState, signUp, type TestApp } from '../test/helpers.js';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());
beforeEach(resetState);

describe('security', () => {
  it('rejects state-changing requests from another origin', async () => {
    const u = await signUp(app);
    const res = await request(app, {
      method: 'POST',
      url: '/api/tasks',
      cookie: u.cookie,
      headers: { origin: 'https://evil.example' },
      payload: { title: 'CSRF', priority: 'LOW' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN_ORIGIN');
  });

  it('allows requests without an Origin header (non-browser clients)', async () => {
    const u = await signUp(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { cookie: u.cookie },
      payload: { title: 'From a device', priority: 'LOW' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('rejects bodies over 100 KB', async () => {
    const u = await signUp(app);
    const res = await request(app, {
      method: 'POST',
      url: '/api/tasks',
      cookie: u.cookie,
      payload: { title: 'Big', priority: 'LOW', notes: 'x'.repeat(200_000) },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('returns the standard error shape for malformed JSON', async () => {
    const u = await signUp(app);
    const res = await request(app, {
      method: 'POST',
      url: '/api/tasks',
      cookie: u.cookie,
      headers: { 'content-type': 'application/json' },
      payload: '{"title":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('sets security headers on API responses', async () => {
    const res = await request(app, { method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});
