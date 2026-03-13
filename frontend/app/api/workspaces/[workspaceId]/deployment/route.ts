import { getDeployment, updateDeployment } from "@/lib/actions/workspace/deployment";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ workspaceId: string }, Awaited<ReturnType<typeof getDeployment>>>(
  async (_req, { workspaceId }) => getDeployment({ workspaceId })
);

export const PUT = handleRoute<{ workspaceId: string }, { success: boolean }>(async (req, { workspaceId }) => {
  const body = await req.json();
  await updateDeployment({ workspaceId, ...body });
  return { success: true };
});
