import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { getSessionStats, GetSessionStatsSchema } from "@/lib/actions/sessions/stats";
import { checkDataRetentionAccess } from "@/lib/actions/usage/limits";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetSessionStatsSchema.omit({ projectId: true }));
  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const retentionError = await checkDataRetentionAccess(projectId, {
    pastHours: parseResult.data.pastHours,
    startDate: parseResult.data.startDate,
  });
  if (retentionError) return retentionError;

  return Response.json(await getSessionStats({ ...parseResult.data, projectId }));
});
