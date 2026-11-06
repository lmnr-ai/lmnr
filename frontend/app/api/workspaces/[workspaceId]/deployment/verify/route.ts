import { verifyDeployment } from "@/lib/actions/workspace/deployment.ts";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "connectivity check, changes nothing",
  apiHandler<{ workspaceId: string }>(async (req, ctx) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();

    const result = await verifyDeployment({
      workspaceId,
      dataPlaneUrl: body.dataPlaneUrl,
    });

    return Response.json({ success: result });
  })
);
