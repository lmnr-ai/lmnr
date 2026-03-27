import { and, eq, sql } from "drizzle-orm";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { traces } from "@/lib/db/migrations/schema";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const { projectId, traceId } = await props.params;

  const result = await db
    .select({ traceTags: traces.traceTags })
    .from(traces)
    .where(and(eq(traces.id, traceId), eq(traces.projectId, projectId)))
    .limit(1);

  const traceTags = result[0]?.traceTags ?? [];

  return Response.json(traceTags);
}

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const { projectId, traceId } = await props.params;
  const body = (await req.json()) as { tagName: string };
  const { tagName } = body;

  if (!tagName || typeof tagName !== "string") {
    return Response.json({ error: "tagName is required" }, { status: 400 });
  }

  // Update PostgreSQL: append tag if not already present
  const result = await db
    .update(traces)
    .set({
      traceTags: sql`array(SELECT DISTINCT unnest(COALESCE(${traces.traceTags}, '{}'::text[]) || ARRAY[${tagName}]::text[]))`,
    })
    .where(and(eq(traces.id, traceId), eq(traces.projectId, projectId)))
    .returning({ traceTags: traces.traceTags });

  // Update ClickHouse: append tag to trace_tags array
  clickhouseClient
    .command({
      query: `
      ALTER TABLE traces_replacing
      UPDATE trace_tags = arrayDistinct(arrayConcat(trace_tags, [{tagName:String}]))
      WHERE id = {traceId:UUID} AND project_id = {projectId:UUID}
    `,
      query_params: {
        tagName,
        traceId,
        projectId,
      },
    })
    .catch((error) => {
      console.error("Error updating trace_tags in ClickHouse", error);
    });

  const updatedTags = result[0]?.traceTags ?? [];
  return Response.json(updatedTags);
}
