import { parseUrlParams } from "@/lib/actions/common/utils";
import { createSignal, deleteSignals, getSignals, GetSignalsSchema } from "@/lib/actions/signals";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute(async (req, { projectId }) => {
  const url = new URL(req.url);
  const parseResult = parseUrlParams(url.searchParams, GetSignalsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return getSignals({ ...parseResult.data, projectId });
});

export const POST = handleRoute(async (req, { projectId }) => {
  const body = await req.json();
  return createSignal({ projectId, ...body });
});

export const DELETE = handleRoute(async (req, { projectId }) => {
  const body = await req.json();
  return deleteSignals({ projectId, ...body });
});
