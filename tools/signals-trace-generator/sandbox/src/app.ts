import express from 'express';
import usersRouter from './routes/users.js';
import postsRouter from './routes/posts.js';

export const app = express();

app.use(express.json());
app.use('/api', usersRouter);
app.use('/api', postsRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));
