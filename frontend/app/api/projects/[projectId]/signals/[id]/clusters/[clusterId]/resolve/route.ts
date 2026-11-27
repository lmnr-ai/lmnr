import { setClusterResolved } from "@/lib/actions/signal-clusters";
import { handlerWithAudit } from "@/lib/audit";

type Params = { projectId: string; id: string; clusterId: string };

export const POST = handlerWithAudit<Params>({ resource: "signal", action: "update" }, async (req, ctx, audit) => {
  const { projectId, id: signalId, clusterId } = await ctx.params;
  const body = await req.json().catch(() => null);
  await audit.target(signalId);
  audit.set({ metadata: { clusterId, resolved: body?.resolved } });
  await setClusterResolved({ projectId, signalId, clusterId, resolved: body?.resolved });
  return Response.json({ success: true });
});
