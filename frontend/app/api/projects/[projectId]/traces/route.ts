import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { deleteTraces, DeleteTracesSchema, getTraces, GetTracesSchema } from "@/lib/actions/traces";
import { checkDataRetentionAccess } from "@/lib/actions/usage/limits";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const params = await ctx.params;
  const projectId = params.projectId;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetTracesSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ items: [] });
  }

  const retentionError = await checkDataRetentionAccess(projectId, {
    pastHours: parseResult.data.pastHours,
    startDate: parseResult.data.startDate,
  });
  if (retentionError) {
    return retentionError;
  }

  const result = await getTraces({ ...parseResult.data, projectId });
  return Response.json(result);
});

export const DELETE = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const traceIds = req.nextUrl.searchParams.getAll("traceId");

  const parseResult = DeleteTracesSchema.safeParse({ projectId, traceIds });

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  await deleteTraces(parseResult.data);
  return new Response("Traces deleted successfully.", { status: 200 });
});
