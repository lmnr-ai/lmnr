import { switchTier } from "@/lib/actions/checkout";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ workspaceId: string }, { success: boolean }>(async (req, { workspaceId }) => {
  const body = await req.json();
  await switchTier({ workspaceId, tier: body.tier });
  return { success: true };
});
