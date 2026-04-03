import { clickhouseClient } from "@/lib/clickhouse/client";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  try {
    const { projectId, traceId } = await props.params;

    const result = await clickhouseClient.query({
      query: `
        SELECT tags
        FROM trace_tags FINAL
        WHERE project_id = {projectId:UUID} AND trace_id = {traceId:UUID}
      `,
      format: "JSONEachRow",
      query_params: { projectId, traceId },
    });

    const rows = await result.json<{ tags: string[] }>();
    const tags = rows.length > 0 ? rows[0].tags : [];

    return Response.json(tags);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  try {
    const { projectId, traceId } = await props.params;
    const body = (await req.json()) as { tagName: string };
    const { tagName } = body;

    if (!tagName || typeof tagName !== "string") {
      return Response.json({ error: "tagName is required" }, { status: 400 });
    }

    // Read current tags from CH
    const result = await clickhouseClient.query({
      query: `
        SELECT tags
        FROM trace_tags FINAL
        WHERE project_id = {projectId:UUID} AND trace_id = {traceId:UUID}
      `,
      format: "JSONEachRow",
      query_params: { projectId, traceId },
    });

    const rows = await result.json<{ tags: string[] }>();
    const currentTags = rows.length > 0 ? rows[0].tags : [];

    // Add the new tag (deduplicate)
    const updatedTags = [...new Set([...currentTags, tagName])];

    // Insert into CH trace_tags table (ReplacingMergeTree deduplicates by updated_at)
    // DateTime64(6) expects microseconds since epoch
    await clickhouseClient.insert({
      table: "trace_tags",
      values: [
        {
          project_id: projectId,
          trace_id: traceId,
          updated_at: Date.now() * 1000,
          tags: updatedTags,
        },
      ],
      format: "JSONEachRow",
    });

    return Response.json(updatedTags);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
