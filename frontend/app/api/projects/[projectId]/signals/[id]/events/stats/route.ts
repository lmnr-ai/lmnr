import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { getEventStats, GetEventStatsSchema } from "@/lib/actions/events/stats";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; id: string }>(async (req, ctx) => {
  const { projectId, id: signalId } = await ctx.params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetEventStatsSchema.omit({ projectId: true, signalId: true }),
    ["filter", "searchIn", "severities"]
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const result = await getEventStats({ ...parseResult.data, projectId, signalId });
  return Response.json(result);
});
