import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { labels } from "@/lib/db/migrations/schema";

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; spanId: string; labelId: string }> }
): Promise<Response> {
  const params = await props.params;
  const spanId = params.spanId;
  const labelId = params.labelId;

  await db.delete(labels).where(and(eq(labels.id, labelId), eq(labels.spanId, spanId)));

  await clickhouseClient.exec({
    query: `
      DELETE FROM default.labels 
      WHERE id = {id: UUID} AND span_id = {span_id: UUID} 
    `,
    query_params: {
      id: labelId,
      span_id: spanId,
    },
  });

  return new Response("Span label deleted successfully", { status: 200 });
}
