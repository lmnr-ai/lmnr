import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createChart, getCharts, updateChartsLayout } from "@/lib/actions/dashboard";

export async function GET(_req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;

  try {
    const charts = await getCharts({ projectId });

    return Response.json(charts);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get chart layouts. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;

  try {
    const body = await req.json();

    await updateChartsLayout({ projectId, ...body });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update chart layouts. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;

  try {
    const body = await req.json();

    await createChart({
      projectId,
      ...body,
    });

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update chart layouts. Please try again." },
      { status: 500 }
    );
  }
}
