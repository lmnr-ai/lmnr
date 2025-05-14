import { z } from "zod";

import { db } from "@/lib/db/drizzle";
import { labelingQueueItems } from "@/lib/db/migrations/schema";

const pushQueueItemSchema = z.array(
  z.object({
    createdAt: z.string().optional(),
    payload: z.object({
      data: z.any(),
      target: z.any(),
    }),
    metadata: z.object({
      source: z.enum(["span", "datapoint"]),
      id: z.string(),
    }),
  })
);

export async function POST(request: Request, props: { params: Promise<{ projectId: string; queueId: string }> }) {
  const params = await props.params;

  const body = await request.json();
  const result = pushQueueItemSchema.safeParse(body);

  if (!result.success) {
    return Response.json({ error: "Invalid request body", details: result.error }, { status: 400 });
  }

  const queueItems = result.data.map((item) => ({
    ...item,
    queueId: params.queueId,
  }));

  const newQueueItems = await db.insert(labelingQueueItems).values(queueItems).returning();

  if (newQueueItems.length === 0) {
    return Response.json({ error: "Failed to push items to queue" }, { status: 500 });
  }

  return Response.json(newQueueItems);
}
