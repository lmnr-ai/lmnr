import { inviteUserToWorkspace } from "@/lib/actions/workspace/invite";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ workspaceId: string }, { success: boolean }>(async (req, { workspaceId }) => {
  const body = (await req.json()) as { email: string };
  await inviteUserToWorkspace({ workspaceId, ...body });
  return { success: true };
});
