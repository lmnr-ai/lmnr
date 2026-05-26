import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils.ts";
import {
  createSignalTrigger,
  deleteSignalTriggers,
  getSignalTriggers,
  GetSignalTriggersSchema,
  updateSignalTrigger,
} from "@/lib/actions/signal-triggers";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; id: string }>(async (req, ctx) => {
  const { projectId, id: signalId } = await ctx.params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetSignalTriggersSchema.omit({ projectId: true, signalId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const result = await getSignalTriggers({ ...parseResult.data, projectId, signalId });

  return Response.json(result);
});

export const POST = apiHandler<{ projectId: string; id: string }>(async (req, ctx) => {
  const { projectId, id: signalId } = await ctx.params;

  const body = await req.json();
  const result = await createSignalTrigger({
    projectId,
    signalId,
    filters: body.filters,
    mode: body.mode ?? 0,
  });

  return Response.json(result);
});

export const PUT = apiHandler<{ projectId: string; id: string }>(async (req, ctx) => {
  const { projectId, id: signalId } = await ctx.params;

  const body = await req.json();
  const result = await updateSignalTrigger({
    projectId,
    signalId,
    triggerId: body.triggerId,
    filters: body.filters,
    mode: body.mode,
  });

  if (!result) {
    return Response.json({ error: "Trigger not found" }, { status: 404 });
  }

  return Response.json(result);
});

export const DELETE = apiHandler<{ projectId: string; id: string }>(async (req, ctx) => {
  const { projectId, id: signalId } = await ctx.params;

  const body = await req.json();
  const result = await deleteSignalTriggers({
    projectId,
    signalId,
    triggerIds: body.triggerIds,
  });

  return Response.json(result);
});
