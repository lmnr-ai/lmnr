import { getProjectsByWorkspace } from "@/lib/actions/projects";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ workspaceId: string }, Awaited<ReturnType<typeof getProjectsByWorkspace>>>(
  async (_req, { workspaceId }) => getProjectsByWorkspace(workspaceId)
);
