import { verifyDeployment } from "@/lib/actions/workspace/deployment.ts";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ workspaceId: string }, { success: Awaited<ReturnType<typeof verifyDeployment>> }>(
  async (req, { workspaceId }) => {
    const body = await req.json();
    const result = await verifyDeployment({
      workspaceId,
      dataPlaneUrl: body.dataPlaneUrl,
    });
    return { success: result };
  }
);
