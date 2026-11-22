import { getClusterReports, startClusterReport } from "@/lib/actions/signal-clusters/report";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";

type Params = { projectId: string; id: string; clusterId: string };

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, id: signalId, clusterId } = await ctx.params;
  return Response.json(await getClusterReports({ projectId, signalId, clusterId }));
});

/** Starts the agent on a report. Poll GET for the result. */
export const POST = handlerWithAudit<Params>({ resource: "signal", action: "update" }, async (_req, ctx, audit) => {
  const { projectId, id: signalId, clusterId } = await ctx.params;
  await audit.target(signalId);
  audit.set({ metadata: { clusterId, report: "generate" } });
  return Response.json(await startClusterReport({ projectId, signalId, clusterId }), { status: 202 });
});
