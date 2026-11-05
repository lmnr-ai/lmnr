import { verifyDeployment } from "@/lib/actions/workspace/deployment.ts";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const body = await req.json();

  const result = await verifyDeployment({
    workspaceId,
    dataPlaneUrl: body.dataPlaneUrl,
  });

  return Response.json({ success: result });
});
