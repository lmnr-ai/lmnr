import { parseUrlParams } from "@/lib/actions/common/utils.ts";
import {
  createSignalTrigger,
  deleteSignalTriggers,
  getSignalTriggers,
  GetSignalTriggersSchema,
  updateSignalTrigger,
} from "@/lib/actions/signal-triggers";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const GET = handleRoute(async (req, { projectId, id: signalId }) => {
  const url = new URL(req.url);
  const parseResult = parseUrlParams(
    url.searchParams,
    GetSignalTriggersSchema.omit({ projectId: true, signalId: true })
  );

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return getSignalTriggers({ ...parseResult.data, projectId, signalId });
});

export const POST = handleRoute(async (req, { projectId, id: signalId }) => {
  const body = await req.json();
  return createSignalTrigger({
    projectId,
    signalId,
    filters: body.filters,
  });
});

export const PUT = handleRoute(async (req, { projectId, id: signalId }) => {
  const body = await req.json();
  const result = await updateSignalTrigger({
    projectId,
    signalId,
    triggerId: body.triggerId,
    filters: body.filters,
  });

  if (!result) {
    throw new HttpError("Trigger not found", 404);
  }

  return result;
});

export const DELETE = handleRoute(async (req, { projectId, id: signalId }) => {
  const body = await req.json();
  return deleteSignalTriggers({
    projectId,
    signalId,
    triggerIds: body.triggerIds,
  });
});
