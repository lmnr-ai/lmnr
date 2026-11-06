import { prettifyError } from "zod/v4";

import { getAgentTracesStats, GetAgentTracesStatsSchema } from "@/lib/actions/agents/traces-stats";
import { parseUrlParams } from "@/lib/actions/common/utils";
import { apiHandler } from "@/lib/api/api-handler";
import { NotFoundError } from "@/lib/api/errors";

export const GET = apiHandler<{ projectId: string; agentId: string }>(async (req, ctx) => {
  const { projectId, agentId } = await ctx.params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetAgentTracesStatsSchema.omit({ projectId: true, agentId: true })
  );
  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const items = await getAgentTracesStats({ ...parseResult.data, projectId, agentId });
  if (!items) throw new NotFoundError("Agent not found");
  return Response.json({ items });
});
