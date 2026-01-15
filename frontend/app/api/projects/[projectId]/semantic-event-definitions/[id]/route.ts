import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import {
  deleteSemanticEventDefinition,
  getSemanticEventDefinition,
  updateSemanticEventDefinition,
} from "@/lib/actions/semantic-event-definitions";

export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;
  const { id, projectId } = params;

  try {
    const result = await getSemanticEventDefinition({ id, projectId });

    if (!result) {
      return NextResponse.json({ error: "Semantic event definition not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch semantic event definition." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;
  const { projectId, id } = params;

  try {
    const body = await request.json();

    const result = await updateSemanticEventDefinition({ projectId, id, ...body });

    if (!result) {
      return NextResponse.json({ error: "Semantic event definition not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update semantic event definition." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;
  const { projectId, id } = params;

  try {
    const result = await deleteSemanticEventDefinition({ projectId, id });

    if (!result) {
      return NextResponse.json({ error: "Semantic event definition not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete semantic event definition." },
      { status: 500 }
    );
  }
}
