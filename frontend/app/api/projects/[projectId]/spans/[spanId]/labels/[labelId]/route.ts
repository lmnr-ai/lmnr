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
  const projectId = params.projectId;
  const spanId = params.spanId;
  const labelId = params.labelId;

  await db
    .delete(labels)
    .where(and(eq(labels.id, labelId), eq(labels.spanId, spanId), eq(labels.projectId, projectId)));

  await clickhouseClient.exec({
    query: `
      DELETE FROM default.labels 
      WHERE id = {id: UUID} AND span_id = {span_id: UUID} AND project_id = {project_id: UUID}
    `,
    query_params: {
      id: labelId,
      span_id: spanId,
      project_id: projectId,
    },
  });

  return new Response("Span label deleted successfully", { status: 200 });
}
