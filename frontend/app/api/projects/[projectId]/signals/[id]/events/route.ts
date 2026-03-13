import { parseUrlParams } from "@/lib/actions/common/utils";
import { getEventsPaginated, GetEventsPaginatedSchema } from "@/lib/actions/events";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute(async (req, { projectId, id: signalId }) => {
  const url = new URL(req.url);
  const parseResult = parseUrlParams(
    url.searchParams,
    GetEventsPaginatedSchema.omit({ projectId: true, signalId: true })
  );

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return getEventsPaginated({ ...parseResult.data, projectId, signalId });
});
