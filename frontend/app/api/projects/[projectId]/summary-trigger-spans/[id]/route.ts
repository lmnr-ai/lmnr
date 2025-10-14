import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { deleteSummaryTriggerSpan, getSummaryTriggerSpan } from "@/lib/actions/summary-trigger-spans";

export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;
  const { id, projectId } = params;

  try {
    const result = await getSummaryTriggerSpan({ id, projectId });

    if (!result) {
      return NextResponse.json({ error: "Summary trigger span not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch summary trigger span." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;
  const { projectId, id } = params;

  try {
    const result = await deleteSummaryTriggerSpan({ projectId, id });

    if (!result) {
      return NextResponse.json({ error: "Summary trigger span not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete summary trigger span." },
      { status: 500 }
    );
  }
}

