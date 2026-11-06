import { apiHandler } from "@/lib/api/api-handler";
import { clickhouseClient } from "@/lib/clickhouse/client";

type Params = { projectId: string; traceId: string };

const readTraceTags = async (projectId: string, traceId: string): Promise<string[]> => {
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
  return rows.length > 0 ? rows[0].tags : [];
};

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, traceId } = await ctx.params;
  return Response.json(await readTraceTags(projectId, traceId));
});

export const POST = apiHandler<Params>(async (req, ctx) => {
  const { projectId, traceId } = await ctx.params;
  const { tagName } = (await req.json()) as { tagName: string };

  if (!tagName || typeof tagName !== "string") {
    return Response.json({ error: "tagName is required" }, { status: 400 });
  }

  const updatedTags = [...new Set([...(await readTraceTags(projectId, traceId)), tagName])];

  // ReplacingMergeTree deduplicates by updated_at
  await clickhouseClient.insert({
    table: "trace_tags",
    values: [{ project_id: projectId, trace_id: traceId, tags: updatedTags }],
    format: "JSONEachRow",
  });

  return Response.json(updatedTags);
});
