import { generateDeploymentKeys } from "@/lib/actions/workspace/deployment.ts";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ workspaceId: string }, { publicKey: string }>(async (_req, { workspaceId }) => {
  const result = await generateDeploymentKeys({ workspaceId });
  return { publicKey: result.publicKey };
});
