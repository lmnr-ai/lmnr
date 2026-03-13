import { parseUrlParams } from "@/lib/actions/common/utils";
import { deleteSessions, getSessions, GetSessionsSchema } from "@/lib/actions/sessions";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const url = new URL(req.url);

  const parseResult = parseUrlParams(url.searchParams, GetSessionsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return await getSessions({ ...parseResult.data, projectId });
});

export const DELETE = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const url = new URL(req.url);

  const sessionIds = url.searchParams.getAll("id");

  await deleteSessions({ projectId, sessionIds });
  return { success: true };
});
