import { transferOwnership } from "@/lib/actions/workspace";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ workspaceId: string }, { success: boolean }>(async (req, { workspaceId }) => {
  const body = await req.json();
  await transferOwnership({
    workspaceId,
    currentOwnerId: body.currentOwnerId,
    newOwnerId: body.newOwnerId,
  });
  return { success: true };
});
