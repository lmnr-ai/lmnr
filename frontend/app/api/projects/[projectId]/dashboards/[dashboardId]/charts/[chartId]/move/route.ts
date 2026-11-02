import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { moveChart } from "@/lib/actions/dashboard";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; dashboardId: string; chartId: string }> }
): Promise<Response> {
  const { projectId, dashboardId, chartId: id } = await props.params;

  try {
    const body = await req.json();
    const chart = await moveChart({ projectId, dashboardId, id, targetDashboardId: body?.targetDashboardId });

    if (!chart) {
      return Response.json({ error: "Chart or dashboard not found" }, { status: 404 });
    }

    return Response.json(chart);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to move chart. Please try again." },
      { status: 500 }
    );
  }
}
