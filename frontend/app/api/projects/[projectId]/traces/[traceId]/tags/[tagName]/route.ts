import { apiHandler } from "@/lib/api/api-handler";
import { noAudit } from "@/lib/audit";
import { clickhouseClient } from "@/lib/clickhouse/client";

export const DELETE = noAudit(
  "trace tagging is not security-relevant",
  apiHandler<{ projectId: string; traceId: string; tagName: string }>(async (_req, ctx) => {
    const { projectId, traceId, tagName } = await ctx.params;

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

    // ReplacingMergeTree deduplicates by updated_at
    await clickhouseClient.insert({
      table: "trace_tags",
      values: [{ project_id: projectId, trace_id: traceId, tags: currentTags.filter((t) => t !== tagName) }],
      format: "JSONEachRow",
    });

    return new Response("Trace tag deleted successfully", { status: 200 });
  })
);
