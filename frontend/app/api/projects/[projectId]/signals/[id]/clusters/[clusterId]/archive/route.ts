import { setClusterArchived } from "@/lib/actions/signal-clusters";
import { handlerWithAudit } from "@/lib/audit";

type Params = { projectId: string; id: string; clusterId: string };

export const POST = handlerWithAudit<Params>({ resource: "signal", action: "update" }, async (req, ctx, audit) => {
  const { projectId, id: signalId, clusterId } = await ctx.params;
  const body = await req.json().catch(() => null);
  await audit.target(signalId);
  audit.set({ metadata: { clusterId, archived: body?.archived } });
  await setClusterArchived({ projectId, signalId, clusterId, archived: body?.archived });
  return Response.json({ success: true });
});
