import { z } from "zod/v4";

import { transformMessages } from "@/lib/actions/trace/utils";
import { clickhouseClient } from "@/lib/clickhouse/client";

export const GetSharedSpanImagesSchema = z.object({
  traceId: z.string(),
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

export async function getSharedSpanImages(input: z.infer<typeof GetSharedSpanImagesSchema>): Promise<SharedSpanImage[]> {
  const { traceId, spanIds } = GetSharedSpanImagesSchema.parse(input);

  if (spanIds.length === 0) {
    return [];
  }

  const chResult = await clickhouseClient.query({
    query: `
      SELECT span_id, name, start_time, end_time, input, output, project_id
      FROM spans
      WHERE span_id IN {spanIds: Array(UUID)} AND trace_id = {traceId: UUID}
      ORDER BY start_time ASC
    `,
    format: "JSONEachRow",
    query_params: { spanIds, traceId },
  });

  const chData = (await chResult.json()) as Array<{
    span_id: string;
    name: string;
    start_time: string;
    end_time: string;
    input: string;
    output: string;
    project_id: string;
  }>;

  return chData.flatMap((spanData) => {
    const input = tryParseJson(spanData.input);

    const inputImages = input ? extractImagesFromMessages(transformMessages(input, spanData.project_id, "public").messages) : [];

    return inputImages.map(
      (imageUrl): SharedSpanImage => ({
        spanId: spanData.span_id,
        spanName: spanData.name,
        startTime: spanData.start_time,
        endTime: spanData.end_time,
        imageUrl,
        timestamp: new Date(`${spanData.start_time}Z`).getTime(),
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
    );
}

const tryParseJson = (value: string) => {
  if (value === "" || value === undefined) return null;

  try {
    return JSON.parse(value);
  } catch (e) {
    // Parse with brackets because we stringify array using comma separator on server.
    try {
      return JSON.parse(`[${value}]`);
    } catch (e2) {
      console.log("Failed to parse JSON with brackets:", e2);
      return value;
    }
  }
};
