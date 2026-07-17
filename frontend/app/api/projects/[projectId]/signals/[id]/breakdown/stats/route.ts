import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import {
  type BreakdownStatsPoint,
  getAgentStats,
  GetAgentStatsSchema,
  getEnumStats,
  GetEnumStatsSchema,
  getSeverityStats,
  GetSeverityStatsSchema,
} from "@/lib/actions/signal-breakdown";

// Multiplexed by ?dimension= so the breakdown hook has one stats endpoint for
// every non-cluster dimension (clusters keep their own /clusters/stats route).
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const { projectId, id: signalId } = await props.params;
  const dimension = req.nextUrl.searchParams.get("dimension");

  try {
    let result: { items: BreakdownStatsPoint[] };
    if (dimension === "severity") {
      const parsed = parseUrlParams(
        req.nextUrl.searchParams,
        GetSeverityStatsSchema.omit({ projectId: true, signalId: true })
      );
      if (!parsed.success) return Response.json({ error: prettifyError(parsed.error) }, { status: 400 });
      result = await getSeverityStats({ ...parsed.data, projectId, signalId });
    } else if (dimension === "agent") {
      const parsed = parseUrlParams(
        req.nextUrl.searchParams,
        GetAgentStatsSchema.omit({ projectId: true, signalId: true })
      );
      if (!parsed.success) return Response.json({ error: prettifyError(parsed.error) }, { status: 400 });
      result = await getAgentStats({ ...parsed.data, projectId, signalId });
    } else if (dimension === "enum") {
      const parsed = parseUrlParams(
        req.nextUrl.searchParams,
        GetEnumStatsSchema.omit({ projectId: true, signalId: true })
      );
      if (!parsed.success) return Response.json({ error: prettifyError(parsed.error) }, { status: 400 });
      result = await getEnumStats({ ...parsed.data, projectId, signalId });
    } else {
      return Response.json({ error: `Unknown breakdown dimension: ${dimension}` }, { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch breakdown stats." },
      { status: 500 }
    );
  }
}
