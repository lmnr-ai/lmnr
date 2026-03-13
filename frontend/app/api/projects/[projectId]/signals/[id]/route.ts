import { deleteSignal, getSignal, updateSignal } from "@/lib/actions/signals";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const GET = handleRoute(async (_req, { id, projectId }) => {
  const result = await getSignal({ id, projectId });

  if (!result) {
    throw new HttpError("Signal not found", 404);
  }

  return result;
});

export const PUT = handleRoute(async (req, { projectId, id }) => {
  const body = await req.json();
  const result = await updateSignal({ id, projectId, ...body });

  if (!result) {
    throw new HttpError("Signal not found", 404);
  }

  return result;
});

export const DELETE = handleRoute(async (_req, { projectId, id }) => {
  const result = await deleteSignal({ projectId, id });

  if (!result) {
    throw new HttpError("Signal not found", 404);
  }

  return result;
});
