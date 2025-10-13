import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createEventDefinition, getEventDefinitions } from "@/lib/actions/event-definitions";

export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const result = await getEventDefinitions({ projectId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch event definitions." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const body = await request.json();

    const result = await createEventDefinition({ projectId, ...body });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create event definition." },
      { status: 500 }
    );
  }
}
