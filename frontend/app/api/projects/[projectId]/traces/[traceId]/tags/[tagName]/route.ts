import { clickhouseClient } from "@/lib/clickhouse/client";

export async function DELETE(
  _req: Request,
  props: { params: Promise<{ projectId: string; traceId: string; tagName: string }> }
): Promise<Response> {
  try {
    const { projectId, traceId, tagName } = await props.params;

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

    // Remove the tag
    const updatedTags = currentTags.filter((t) => t !== tagName);

    // Insert updated row (ReplacingMergeTree deduplicates by updated_at)
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

    return new Response("Trace tag deleted successfully", { status: 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
