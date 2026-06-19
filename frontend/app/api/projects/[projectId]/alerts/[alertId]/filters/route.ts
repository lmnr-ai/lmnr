import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createAlertFilter, deleteAlertFilters, getAlertFilters, updateAlertFilter } from "@/lib/actions/alert-filters";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; alertId: string }> }
): Promise<Response> {
  const { projectId, alertId } = await props.params;

  try {
    const result = await getAlertFilters({ projectId, alertId });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch filters." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; alertId: string }> }
): Promise<Response> {
  const { projectId, alertId } = await props.params;

  try {
    const body = await req.json();
    const result = await createAlertFilter({ projectId, alertId, filters: body.filters });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create filter." },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; alertId: string }> }
): Promise<Response> {
  const { projectId, alertId } = await props.params;

  try {
    const body = await req.json();
    const result = await updateAlertFilter({
      projectId,
      alertId,
      filterId: body.filterId,
      filters: body.filters,
    });

    if (!result) {
      return Response.json({ error: "Filter not found" }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update filter." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; alertId: string }> }
): Promise<Response> {
  const { projectId, alertId } = await props.params;

  try {
    const body = await req.json();
    const result = await deleteAlertFilters({ projectId, alertId, filterIds: body.filterIds });

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete filters." },
      { status: 500 }
    );
  }
}
