import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('GET /api/posts', () => {
  it('returns a default page of posts', async () => {
    const res = await request(app).get('/api/posts');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(50);
    expect(res.body.pagination).toEqual({ total: 85, limit: 50, offset: 0 });
  });

  it('honours limit and offset', async () => {
    const res = await request(app).get('/api/posts?limit=10&offset=20');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.data[0].id).toBe(21);
  });

  it('rejects a limit above the maximum', async () => {
    const res = await request(app).get('/api/posts?limit=101');
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });
});
