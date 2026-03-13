import { getWorkspaceUsers } from "@/lib/actions/workspace";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ workspaceId: string }, Awaited<ReturnType<typeof getWorkspaceUsers>>>(
  async (_req, { workspaceId }) => getWorkspaceUsers({ workspaceId })
);
