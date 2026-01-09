import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import {
  createSemanticEventDefinition,
  deleteSemanticEventDefinitions,
  getSemanticEventDefinitions,
  GetSemanticEventDefinitionsSchema,
} from "@/lib/actions/semantic-event-definitions";

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  const parseResult = parseUrlParams(request.nextUrl.searchParams, GetSemanticEventDefinitionsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getSemanticEventDefinitions({ ...parseResult.data, projectId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch semantic event definitions." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const body = await request.json();

    const result = await createSemanticEventDefinition({ projectId, ...body });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create semantic event definition." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const body = await request.json();

    const result = await deleteSemanticEventDefinitions({ projectId, ...body });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete semantic event definitions." },
      { status: 500 }
    );
  }
}


