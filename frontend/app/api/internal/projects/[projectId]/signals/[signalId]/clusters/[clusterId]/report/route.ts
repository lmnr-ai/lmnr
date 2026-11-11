import { startClusterReport } from "@/lib/actions/signal-clusters/report";
import { internalApiHandler } from "@/lib/api/internal";
import { handlerNoAudit } from "@/lib/audit";

// app-server asks for a report on every new L1 cluster (`clustering/private/reports.rs`).
export const POST = handlerNoAudit(
  "Cluster reports Laminar starts itself; the agent's writes are audited as they happen",
  internalApiHandler<{ projectId: string; signalId: string; clusterId: string }>(async (_req, { params }) =>
    Response.json(await startClusterReport(params), { status: 202 })
  )
);
