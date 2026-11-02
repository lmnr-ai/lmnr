import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getAgentTracesStats, GetAgentTracesStatsSchema } from "@/lib/actions/agents/traces-stats";
import { parseUrlParams } from "@/lib/actions/common/utils";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string; agentId: string }> }) {
  const { projectId, agentId } = await props.params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetAgentTracesStatsSchema.omit({ projectId: true, agentId: true })
  );
  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const items = await getAgentTracesStats({ ...parseResult.data, projectId, agentId });
    if (!items) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }
    return Response.json({ items });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
