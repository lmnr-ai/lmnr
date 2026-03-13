import { parseUrlParams } from "@/lib/actions/common/utils";
import { getEventStats, GetEventStatsSchema } from "@/lib/actions/events/stats";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute(async (req, { projectId, id: signalId }) => {
  const url = new URL(req.url);
  const parseResult = parseUrlParams(url.searchParams, GetEventStatsSchema.omit({ projectId: true, signalId: true }));

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return getEventStats({ ...parseResult.data, projectId, signalId });
});
