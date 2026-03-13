import { deleteWorkspace, getWorkspace, updateWorkspace } from "@/lib/actions/workspace";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ workspaceId: string }, { message: string }>(async (req, { workspaceId }) => {
  const body = await req.json();
  await updateWorkspace({ workspaceId, ...body });
  return { message: "Workspace renamed successfully." };
});

export const GET = handleRoute<{ workspaceId: string }, Awaited<ReturnType<typeof getWorkspace>>>(
  async (_req, { workspaceId }) => getWorkspace({ workspaceId })
);

export const DELETE = handleRoute<{ workspaceId: string }, { success: boolean }>(async (_req, { workspaceId }) => {
  await deleteWorkspace({ workspaceId });
  return { success: true };
});
