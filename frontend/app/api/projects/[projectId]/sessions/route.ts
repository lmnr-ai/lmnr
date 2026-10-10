import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { deleteSessions, getSessions, GetSessionsSchema } from "@/lib/actions/sessions";
import { checkDataRetentionAccess } from "@/lib/actions/usage/limits";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const params = await ctx.params;
  const projectId = params.projectId;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetSessionsSchema.omit({ projectId: true }));

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

  const result = await getSessions({ ...parseResult.data, projectId });
  return Response.json(result);
});

export const DELETE = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const params = await ctx.params;
  const projectId = params.projectId;

  const sessionIds = req.nextUrl.searchParams.getAll("id");

  await deleteSessions({ projectId, sessionIds });
  return Response.json({ success: true });
});
