import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { deleteSignal, getSignal, updateSignal } from "@/lib/actions/signals";

export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;
  const { id, projectId } = params;

  try {
    const result = await getSignal({ id, projectId });

    if (!result) {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch signal." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;
  const { projectId, id } = params;

  try {
    const body = await request.json();
    const result = await updateSignal({ id, projectId, ...body });

    if (!result) {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update signal." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;
  const { projectId, id } = params;

  try {
    const result = await deleteSignal({ projectId, id });

    if (!result) {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete signal." },
      { status: 500 }
    );
  }
}
