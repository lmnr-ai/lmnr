import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { deleteDashboard, LastDashboardError, renameDashboard } from "@/lib/actions/dashboard/dashboards";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; dashboardId: string }> }
): Promise<Response> {
  const { projectId, dashboardId } = await props.params;

  try {
    const body = await req.json();

    const dashboard = await renameDashboard({ ...body, projectId, dashboardId });

    if (!dashboard) {
      return Response.json({ error: "Dashboard not found" }, { status: 404 });
    }

    return Response.json(dashboard);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to rename dashboard. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; dashboardId: string }> }
): Promise<Response> {
  const { projectId, dashboardId } = await props.params;

  try {
    await deleteDashboard({ projectId, dashboardId });

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    if (error instanceof LastDashboardError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete dashboard. Please try again." },
      { status: 500 }
    );
  }
}
