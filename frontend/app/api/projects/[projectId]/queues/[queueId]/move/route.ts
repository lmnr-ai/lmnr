import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/drizzle";
import { labelingQueueItems } from "@/lib/db/migrations/schema";

// Add request body validation schema
const RequestBodySchema = z.object({
  refDate: z.string(),
  direction: z.enum(["next", "prev"]),
});

export async function POST(req: Request, props: { params: Promise<{ projectId: string; queueId: string }> }) {
  const params = await props.params;

  // Validate body
  const body = await req.json();
  const parsedBody = RequestBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { refDate, direction } = parsedBody.data;

  const [{ count }] = await db
    .select({
      count: sql<number>`count(*)::int4`,
    })
    .from(labelingQueueItems)
    .where(eq(labelingQueueItems.queueId, params.queueId));

  if (direction === "next") {
    const nextItem = await db.query.labelingQueueItems.findFirst({
      where: and(eq(labelingQueueItems.queueId, params.queueId), gt(labelingQueueItems.createdAt, refDate)),
      orderBy: asc(labelingQueueItems.createdAt),
    });

    if (!nextItem) {
      return Response.json({});
    }

    console.log("next item", nextItem);
    // Get position for next item
    const [{ position }] = await db
      .select({
        position: sql<number>`(
          SELECT COUNT(*)::int4
          FROM labeling_queue_items
          WHERE queue_id = ${params.queueId}
          AND created_at < ${nextItem.createdAt}
        ) + 1`,
      })
      .from(labelingQueueItems)
      .where(eq(labelingQueueItems.queueId, params.queueId));

    return Response.json({
      ...nextItem,
      count,
      position,
    });
  } else if (direction === "prev") {
    const prevItem = await db.query.labelingQueueItems.findFirst({
      where: and(eq(labelingQueueItems.queueId, params.queueId), lt(labelingQueueItems.createdAt, refDate)),
      orderBy: desc(labelingQueueItems.createdAt),
    });

    if (!prevItem) {
      return Response.json({});
    }

    // Get position for prev item
    const [{ position }] = await db
      .select({
        position: sql<number>`(
          SELECT COUNT(*)::int4
          FROM labeling_queue_items
          WHERE queue_id = ${params.queueId}
          AND created_at < ${prevItem.createdAt}
        ) + 1`,
      })
      .from(labelingQueueItems)
      .where(eq(labelingQueueItems.queueId, params.queueId));

    return Response.json({
      ...prevItem,
      count,
      position,
    });
  }

  return Response.json({ error: "Invalid direction" }, { status: 400 });
}
