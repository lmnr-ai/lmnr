import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { deleteTraces, DeleteTracesSchema, getTraces, GetTracesSchema } from "@/lib/actions/traces";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;

  const parseResult = parseUrlParams(new URL(req.url).searchParams, GetTracesSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return { items: [] };
  }

  return await getTraces({ ...parseResult.data, projectId });
});

export const DELETE = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const traceIds = new URL(req.url).searchParams.getAll("traceId");

  const parseResult = DeleteTracesSchema.safeParse({ projectId, traceIds });

  if (!parseResult.success) {
    throw new Error(prettifyError(parseResult.error));
  }

  await deleteTraces(parseResult.data);
  return { success: true };
});
