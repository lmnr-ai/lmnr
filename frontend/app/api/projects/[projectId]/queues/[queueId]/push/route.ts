import { z } from 'zod';

import { db } from '@/lib/db/drizzle';
import { labelingQueueItems } from '@/lib/db/migrations/schema';

const pushQueueItemSchema = z.object({
  spanId: z.string(),
});

// push an item to the queue
export async function POST(request: Request, { params }: { params: { projectId: string; queueId: string } }) {

  const body = await request.json();
  const result = pushQueueItemSchema.safeParse(body);

  if (!result.success) {
    return Response.json({ error: 'Invalid request body', details: result.error }, { status: 400 });
  }

  const { spanId } = result.data;

  const newQueueItem = await db.insert(labelingQueueItems).values({
    queueId: params.queueId,
    spanId,
    action: {},
  }).returning();

  if (newQueueItem.length === 0) {
    return Response.json({ error: 'Failed to push item to queue' }, { status: 500 });
  }

  return Response.json(newQueueItem[0]);
}
