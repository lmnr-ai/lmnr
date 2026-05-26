import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { getEventsPaginated, GetEventsPaginatedSchema } from "@/lib/actions/events";
import { checkDataRetentionAccess } from "@/lib/actions/usage/limits";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; id: string }>(async (req, ctx) => {
  const { projectId, id: signalId } = await ctx.params;
  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetEventsPaginatedSchema.omit({ projectId: true, signalId: true }),
    ["filter", "searchIn", "clusterId"]
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const retentionError = await checkDataRetentionAccess(projectId, {
    pastHours: parseResult.data.pastHours,
    startDate: parseResult.data.startDate,
  });
  if (retentionError) {
    return retentionError;
  }

  const result = await getEventsPaginated({ ...parseResult.data, projectId, signalId });
  return Response.json(result);
});
