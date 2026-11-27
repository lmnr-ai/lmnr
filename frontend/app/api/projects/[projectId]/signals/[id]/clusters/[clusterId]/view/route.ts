import { markClusterViewed } from "@/lib/actions/signal-clusters";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "per-user read marker, fired on every report open; not security-relevant",
  apiHandler<{ projectId: string; id: string; clusterId: string }>(async (_req, ctx) => {
    const { projectId, id: signalId, clusterId } = await ctx.params;
    await markClusterViewed({ projectId, signalId, clusterId });
    return Response.json({ success: true });
  })
);
