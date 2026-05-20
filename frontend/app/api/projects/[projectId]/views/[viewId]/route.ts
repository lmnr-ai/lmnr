import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { deleteView, updateView, ViewNameConflictError } from "@/lib/actions/view";

export async function PATCH(req: Request, props: { params: Promise<{ projectId: string; viewId: string }> }) {
  try {
    const { projectId, viewId } = await props.params;
    const body = await req.json();

    const result = await updateView({
      projectId,
      viewId,
      name: body.name,
      config: body.config,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ViewNameConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    if (error instanceof Error && error.message === "View not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update view. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ projectId: string; viewId: string }> }) {
  try {
    const { projectId, viewId } = await props.params;

    await deleteView({ projectId, viewId });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    if (error instanceof Error && error.message === "View not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete view. Please try again." },
      { status: 500 }
    );
  }
}
