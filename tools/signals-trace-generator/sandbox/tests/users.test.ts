import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('GET /api/users', () => {
  it('returns a list of users', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });
});

describe('GET /api/users/:id', () => {
  it('returns a single user', async () => {
    const res = await request(app).get('/api/users/1');
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(1);
  });

  it('404s for an unknown user', async () => {
    const res = await request(app).get('/api/users/99999');
    expect(res.status).toBe(404);
  });
});
