import { isCurrentUserMemberOfProject } from '@/lib/db/utils';
import { db } from '@/lib/db/drizzle';
import { labelingQueueData, spans } from '@/lib/db/schema';
import { asc, eq, gt, and, lt, desc, sql } from 'drizzle-orm';
import { z } from 'zod';

// Add request body validation schema
const RequestBodySchema = z.object({
  refDate: z.string(),
  direction: z.enum(['next', 'prev']),
});

export async function POST(
  req: Request,
  { params }: { params: { projectId: string; queueId: string } }
) {

  if (!(await isCurrentUserMemberOfProject(params.projectId))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Validate body
  const body = await req.json();
  const parsedBody = RequestBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { refDate, direction } = parsedBody.data;

  console.log('move', refDate, direction);
  if (direction === 'next') {
    // return the next item in the queue after the refDataId

    const nextItem = await db
      .select({
        queueData: labelingQueueData,
        span: spans,
      })
      .from(labelingQueueData)
      .innerJoin(spans, eq(labelingQueueData.spanId, spans.spanId))
      .where(and(eq(labelingQueueData.queueId, params.queueId), gt(labelingQueueData.createdAt, refDate)))
      .orderBy(asc(labelingQueueData.createdAt))
      .limit(1);

    const stats = await db
      .select({
        count: sql<number>`(count(*) OVER())::int4`,
        position: sql<number>`(
          SELECT COUNT(*)
          FROM labeling_queue_data
          WHERE queue_id = ${params.queueId}
          AND created_at <= (
            SELECT created_at
            FROM labeling_queue_data
            WHERE queue_id = ${params.queueId}
            AND created_at > ${refDate}
            ORDER BY created_at ASC
            LIMIT 1
          )
        )::int4`
      })
      .from(labelingQueueData)
      .where(eq(labelingQueueData.queueId, params.queueId))
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
        queueData: labelingQueueData,
        span: spans
      })
      .from(labelingQueueData)
      .innerJoin(spans, eq(labelingQueueData.spanId, spans.spanId))
      .where(and(eq(labelingQueueData.queueId, params.queueId), lt(labelingQueueData.createdAt, refDate)))
      .orderBy(desc(labelingQueueData.createdAt))
      .limit(1);


    const stats = await db
      .select({
        count: sql<number>`(count(*) OVER())::int4`,
        position: sql<number>`(
          SELECT COUNT(*)
          FROM labeling_queue_data
          WHERE queue_id = ${params.queueId}
          AND created_at <= (
            SELECT created_at
            FROM labeling_queue_data
            WHERE queue_id = ${params.queueId}
            AND created_at < ${refDate}
            ORDER BY created_at DESC
            LIMIT 1
          )
        )::int4`
      })
      .from(labelingQueueData)
      .where(eq(labelingQueueData.queueId, params.queueId))
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
