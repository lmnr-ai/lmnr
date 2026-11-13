import { z } from "zod/v4";

import { startClusterReport } from "@/lib/actions/signal-clusters/report";
import { internalApiHandler } from "@/lib/api/internal";
import { handlerNoAudit } from "@/lib/audit";

const BodySchema = z.object({ regenerate: z.boolean().optional() });

// app-server asks for a report on every new L1 cluster, and a fresh one when new events reopen a
// resolved cluster (`clustering/private/reports.rs`).
export const POST = handlerNoAudit(
  "Cluster reports Laminar starts itself; the agent's writes are audited as they happen",
  internalApiHandler<{ projectId: string; signalId: string; clusterId: string }>(async (req, { params }) => {
    const { regenerate } = BodySchema.parse(await req.json().catch(() => ({})));
    return Response.json(await startClusterReport(params, { regenerate }), { status: 202 });
  })
);
