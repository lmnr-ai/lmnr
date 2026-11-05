import { generateDeploymentKeys } from "@/lib/actions/workspace/deployment.ts";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;

  const result = await generateDeploymentKeys({ workspaceId });

  return Response.json({ publicKey: result.publicKey });
});
