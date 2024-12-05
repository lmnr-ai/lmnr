import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/drizzle';
import { labelingQueueItems, spans } from '@/lib/db/migrations/schema';

// Add request body validation schema
const RequestBodySchema = z.object({
  refDate: z.string(),
  direction: z.enum(['next', 'prev']),
});

export async function POST(
  req: Request,
  { params }: { params: { projectId: string; queueId: string } }
) {

  // Validate body
  const body = await req.json();
  const parsedBody = RequestBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { refDate, direction } = parsedBody.data;

  if (direction === 'next') {
    // return the next item in the queue after the refDataId

    const nextItem = await db
      .select({
        queueData: labelingQueueItems,
        span: spans,
      })
      .from(labelingQueueItems)
      .innerJoin(spans, eq(labelingQueueItems.spanId, spans.spanId))
      .where(and(eq(labelingQueueItems.queueId, params.queueId), gt(labelingQueueItems.createdAt, refDate)))
      .orderBy(asc(labelingQueueItems.createdAt))
      .limit(1);

    const stats = await db
      .select({
        count: sql<number>`(count(*) OVER())::int4`,
        position: sql<number>`(
          SELECT COUNT(*)
          FROM labeling_queue_items
          WHERE queue_id = ${params.queueId}
          AND created_at <= (
            SELECT created_at
            FROM labeling_queue_items
            WHERE queue_id = ${params.queueId}
            AND created_at > ${refDate}
            ORDER BY created_at ASC
            LIMIT 1
          )
        )::int4`
      })
      .from(labelingQueueItems)
      .where(eq(labelingQueueItems.queueId, params.queueId))
      .limit(1);

    if (nextItem.length === 0 || stats.length === 0) {
      return Response.json(null);
    }

    return Response.json({
      ...nextItem[0],
      count: stats[0].count,
      position: stats[0].position
    });

  } else if (direction === 'prev') {
    // return the previous item in the queue before the refDataId

    const prevItem = await db
      .select({
        queueData: labelingQueueItems,
        span: spans
      })
      .from(labelingQueueItems)
      .innerJoin(spans, eq(labelingQueueItems.spanId, spans.spanId))
      .where(and(eq(labelingQueueItems.queueId, params.queueId), lt(labelingQueueItems.createdAt, refDate)))
      .orderBy(desc(labelingQueueItems.createdAt))
      .limit(1);


    const stats = await db
      .select({
        count: sql<number>`(count(*) OVER())::int4`,
        position: sql<number>`(
          SELECT COUNT(*)
          FROM labeling_queue_items
          WHERE queue_id = ${params.queueId}
          AND created_at <= (
            SELECT created_at
            FROM labeling_queue_items
            WHERE queue_id = ${params.queueId}
            AND created_at < ${refDate}
            ORDER BY created_at DESC
            LIMIT 1
          )
        )::int4`
      })
      .from(labelingQueueItems)
      .where(eq(labelingQueueItems.queueId, params.queueId))
      .limit(1);

    if (prevItem.length === 0 || stats.length === 0) {
      return Response.json(null);
    }

    return Response.json({
      ...prevItem[0],
      count: stats[0].count,
      position: stats[0].position
    });
  }

  return Response.json({ error: 'Invalid direction' }, { status: 400 });

}
