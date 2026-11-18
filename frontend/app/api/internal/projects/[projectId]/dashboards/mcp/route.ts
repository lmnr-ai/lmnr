import { ensureMcpDashboard } from "@/lib/actions/dashboard/mcp-dashboard";
import { internalApiHandler } from "@/lib/api/internal";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "System write: app-server creates the MCP dashboard when a project ingests its first MCP request",
  internalApiHandler<{ projectId: string }>(async (_request, { params }) =>
    Response.json(await ensureMcpDashboard({ projectId: params.projectId }))
  )
);
