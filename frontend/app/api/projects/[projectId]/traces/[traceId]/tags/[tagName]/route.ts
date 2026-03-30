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
  await db
    .update(traces)
    .set({
      traceTags: sql`array_remove(COALESCE(${traces.traceTags}, '{}'::text[]), ${tagName})`,
    })
    .where(and(eq(traces.id, traceId), eq(traces.projectId, projectId)));

  // Update ClickHouse: remove tag from trace_tags array
  // With mutations_sync=0, this returns immediately while the mutation runs in the background.
  await clickhouseClient.command({
    query: `
      ALTER TABLE traces_replacing
      UPDATE trace_tags = arrayFilter(x -> x != {tagName:String}, trace_tags)
      WHERE id = {traceId:UUID} AND project_id = {projectId:UUID}
    `,
    query_params: {
      tagName,
      traceId,
      projectId,
    },
  });

  return new Response("Trace tag deleted successfully", { status: 200 });
}
