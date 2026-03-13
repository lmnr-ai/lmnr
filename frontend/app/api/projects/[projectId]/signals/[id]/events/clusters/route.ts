import { getEventClusters } from "@/lib/actions/clusters";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute(async (_req, { projectId, id: signalId }) => getEventClusters({ projectId, signalId }));
