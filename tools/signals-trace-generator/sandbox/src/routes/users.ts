import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// GET /users — returns every user in the table.
router.get('/users', async (_req, res) => {
  const users = await db.users.findAll();
  res.json({ users });
});

router.get('/users/:id', async (req, res) => {
  const user = await db.users.findById(Number(req.params.id));
  if (!user) {
    return res.status(404).json({ error: 'user not found' });
  }
  res.json({ user });
});

export default router;
