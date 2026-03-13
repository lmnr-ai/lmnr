import { parseUrlParams } from "@/lib/actions/common/utils";
import { getSignalRuns, GetSignalRunsSchema } from "@/lib/actions/signal-runs";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute(async (req, { projectId, id: signalId }) => {
  const url = new URL(req.url);
  const parseResult = parseUrlParams(url.searchParams, GetSignalRunsSchema.omit({ projectId: true, signalId: true }));

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return getSignalRuns({ ...parseResult.data, projectId, signalId });
});
