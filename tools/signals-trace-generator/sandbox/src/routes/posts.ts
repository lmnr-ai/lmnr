import { Router } from 'express';
import { db } from '../db.js';
import { parsePagination } from '../pagination.js';

const router = Router();

// GET /posts — offset-based pagination. This is the house style: every list
// endpoint parses its params with parsePagination and returns { data, pagination }.
router.get('/posts', async (req, res) => {
  const parsed = parsePagination(req.query);
  if ('error' in parsed) {
    return res.status(400).json({ error: parsed.error });
  }

  const { limit, offset } = parsed;
  const [data, total] = await Promise.all([
    db.posts.findAll({ limit, offset }),
    db.posts.count(),
  ]);

  res.json({ data, pagination: { total, limit, offset } });
});

export default router;
