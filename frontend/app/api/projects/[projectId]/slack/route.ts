import { getSlackIntegration } from "@/lib/actions/slack";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute(async (_req, { projectId }) => getSlackIntegration(projectId));
