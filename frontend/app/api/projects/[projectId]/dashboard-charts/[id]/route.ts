import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { deleteDashboardChart, getChart, updateChart, updateChartName } from "@/lib/actions/dashboard";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const { projectId, id } = await props.params;

  try {
    const chart = await getChart({ projectId, id });

    if (!chart) {
      return Response.json({ error: "Chart not found" }, { status: 404 });
    }

    return Response.json(chart);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get chart. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const { projectId, id } = await props.params;

  try {
    await deleteDashboardChart({ projectId, id });

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete chart. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const { projectId, id } = await props.params;

  try {
    const body = await req.json();

    // PATCH is used for partial updates (name only)
    await updateChartName({ projectId, id, ...body });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update chart name. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const { projectId, id } = await props.params;

  try {
    const body = await req.json();

    // PUT is used for full chart updates (name, query, config)
    await updateChart({ projectId, id, ...body });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update chart. Please try again." },
      { status: 500 }
    );
  }
}
