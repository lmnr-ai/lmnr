import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { deleteEventDefinition, getEventDefinition, updateEventDefinition } from "@/lib/actions/event-definitions";

export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;
  const { id } = params;

  try {
    const result = await getEventDefinition({ id });

    if (!result) {
      return NextResponse.json({ error: "Event definition not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch event definition." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;
  const { projectId, id } = params;

  try {
    const body = await request.json();

    const result = await updateEventDefinition({ projectId, id, ...body });

    if (!result) {
      return NextResponse.json({ error: "Event definition not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update event definition." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;
  const { projectId, id } = params;

  try {
    const result = await deleteEventDefinition({ projectId, id });

    if (!result) {
      return NextResponse.json({ error: "Event definition not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete event definition." },
      { status: 500 }
    );
  }
}
