import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { transformMessages } from "@/lib/actions/trace/utils";
import { db } from "@/lib/db/drizzle";
import { sharedTraces } from "@/lib/db/migrations/schema";

export const GetSharedSpanImagesSchema = z.object({
  traceId: z.guid(),
  spanIds: z.array(z.string()),
});

export interface SharedSpanImage {
  spanId: string;
  spanName: string;
  startTime: string;
  endTime: string;
  imageUrl: string;
  timestamp: number; // Unix timestamp in milliseconds for video timeline
}

export async function getSharedSpanImages(
  input: z.infer<typeof GetSharedSpanImagesSchema>
): Promise<SharedSpanImage[]> {
  const { traceId, spanIds } = GetSharedSpanImagesSchema.parse(input);

  if (spanIds.length === 0) {
    return [];
  }

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: eq(sharedTraces.id, traceId),
  });

  if (!sharedTrace) {
    return [];
  }

  const rows = await executeQuery<{
    spanId: string;
    spanName: string;
    startTime: string;
    endTime: string;
    input: string;
  }>({
    query: `
      SELECT
        span_id as spanId,
        name as spanName,
        formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime,
        formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime,
        input
      FROM spans
      WHERE span_id IN {spanIds: Array(UUID)} AND trace_id = {traceId: UUID}
      ORDER BY start_time ASC
    `,
    parameters: { spanIds, traceId },
    projectId: sharedTrace.projectId,
  });

  return rows.flatMap((span) => {
    const inputImages = extractImagesFromMessages(
      transformMessages(span.input, sharedTrace.projectId, "public").messages
    );

    return inputImages.map(
      (imageUrl): SharedSpanImage => ({
        spanId: span.spanId,
        spanName: span.spanName,
        startTime: span.startTime,
        endTime: span.endTime,
        imageUrl,
        timestamp: new Date(span.startTime).getTime(),
      })
    );
  });
}

function extractImagesFromMessages(messages: any): string[] {
  if (!messages || !Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message.content && Array.isArray(message.content))
    .flatMap((message) =>
      message.content
        .filter((part: any) => part.type === "image_url")
        .map((part: any) => part.image_url?.url || part.url)
        .filter(Boolean)
    )
    .reverse()
    .slice(0, 1);
}
