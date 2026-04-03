import { and, eq, sql } from "drizzle-orm";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { traces } from "@/lib/db/migrations/schema";

export async function DELETE(
  _req: Request,
  props: { params: Promise<{ projectId: string; traceId: string; tagName: string }> }
): Promise<Response> {
  // Next.js auto-decodes dynamic route params, so no decodeURIComponent needed
  const { projectId, traceId, tagName } = await props.params;

  // Update PostgreSQL: remove the tag from the array
  const result = await db
    .update(traces)
    .set({
      traceTags: sql`array_remove(COALESCE(${traces.traceTags}, '{}'::text[]), ${tagName})`,
    })
    .where(and(eq(traces.id, traceId), eq(traces.projectId, projectId)))
    .returning({ traceTags: traces.traceTags });

  if (result.length === 0) {
    return Response.json({ error: "Trace not found" }, { status: 404 });
  }

  // Insert into ClickHouse trace_tags table with updated tags (ReplacingMergeTree deduplicates by updated_at)
  const updatedTags = result[0].traceTags ?? [];
  await clickhouseClient.command({
    query: `
      INSERT INTO trace_tags (project_id, trace_id, updated_at, tags)
      VALUES ({projectId:UUID}, {traceId:UUID}, now64(6, 'UTC'), {tags:Array(String)})
    `,
    query_params: {
      projectId,
      traceId,
      tags: updatedTags,
    },
  });

  return new Response("Trace tag deleted successfully", { status: 200 });
}
