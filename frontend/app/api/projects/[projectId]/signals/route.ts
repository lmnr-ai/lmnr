import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { createSignal, deleteSignals, getSignals, GetSignalsSchema } from "@/lib/actions/signals";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (request, ctx) => {
  const { projectId } = await ctx.params;

  const parseResult = parseUrlParams(request.nextUrl.searchParams, GetSignalsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const result = await getSignals({ ...parseResult.data, projectId });
  return Response.json(result);
});

export const POST = apiHandler<{ projectId: string }>(async (request, ctx) => {
  const { projectId } = await ctx.params;

  const body = await request.json();

  const result = await createSignal({ projectId, ...body });

  return Response.json(result);
});

export const DELETE = apiHandler<{ projectId: string }>(async (request, ctx) => {
  const { projectId } = await ctx.params;

  const body = await request.json();

  const result = await deleteSignals({ projectId, ...body });

  return Response.json(result);
});
