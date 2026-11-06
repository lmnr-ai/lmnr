import { generateDeploymentKeys } from "@/lib/actions/workspace/deployment.ts";
import { handlerWithAudit } from "@/lib/audit";

export const POST = handlerWithAudit<{ workspaceId: string }>(
  { resource: "deployment", action: "create", noTarget: true },
  async (_req, ctx) => {
    const { workspaceId } = await ctx.params;

    const result = await generateDeploymentKeys({ workspaceId });

    return Response.json({ publicKey: result.publicKey });
  }
);
