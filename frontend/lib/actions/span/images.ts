import { z } from "zod/v4";

import { transformMessages } from "@/lib/actions/trace/utils";
import { clickhouseClient } from "@/lib/clickhouse/client";

export const GetSpanImagesSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
  spanIds: z.array(z.string()),
});

export interface SpanImage {
  spanId: string;
  spanName: string;
  startTime: string;
  endTime: string;
  imageUrl: string;
  timestamp: number; // Unix timestamp in milliseconds for video timeline
}

export async function getSpanImages(input: z.infer<typeof GetSpanImagesSchema>): Promise<SpanImage[]> {
  const { projectId, traceId, spanIds } = GetSpanImagesSchema.parse(input);

  if (spanIds.length === 0) {
    return [];
  }

  const chResult = await clickhouseClient.query({
    query: `
      SELECT span_id, name, start_time, end_time, input, output
      FROM spans
      WHERE span_id IN {spanIds: Array(UUID)} AND project_id = {projectId: UUID} AND trace_id = {traceId: UUID}
      ORDER BY start_time ASC
    `,
    format: "JSONEachRow",
    query_params: { spanIds, projectId, traceId },
  });

  const chData = (await chResult.json()) as Array<{
    span_id: string;
    name: string;
    start_time: string;
    end_time: string;
    input: string;
    output: string;
  }>;

  return chData.flatMap((spanData) => {
    const input = tryParseJson(spanData.input);

    const inputImages = input ? extractImagesFromMessages(transformMessages(input, projectId, "private").messages) : [];

    return inputImages.map(
      (imageUrl): SpanImage => ({
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
    )
    .reverse()
    .slice(0, 1);
}

const tryParseJson = (value: string) => {
  if (value === "" || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};
