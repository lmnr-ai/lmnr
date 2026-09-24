import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createDashboard, getDashboards, getOrCreateDefaultDashboard } from "@/lib/actions/dashboard/dashboards";

export async function GET(_req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;

  try {
    const dashboards = await getDashboards({ projectId });

    if (dashboards.length > 0) {
      return Response.json(dashboards);
    }

    // Callers outside the dashboards page (e.g. the SQL editor's export dialog)
    // may be the first to touch a project that has never had a dashboard.
    await getOrCreateDefaultDashboard({ projectId });

    return Response.json(await getDashboards({ projectId }));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get dashboards. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;

  try {
    const body = await req.json();

    const dashboard = await createDashboard({ ...body, projectId });

    return Response.json(dashboard);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create dashboard. Please try again." },
      { status: 500 }
    );
  }
}
