import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import {
  getTraceCountForBackfill,
  GetTraceCountForBackfillSchema,
  getTraceIdsForBackfill,
  GetTraceIdsForBackfillSchema,
  triggerSemanticEventBackfill,
  TriggerSemanticEventBackfillSchema,
} from "@/lib/actions/semantic-event-definitions/backfill";

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  const action = request.nextUrl.searchParams.get("action");

  if (action === "count") {
    const parseResult = parseUrlParams(
      request.nextUrl.searchParams,
      GetTraceCountForBackfillSchema.omit({ projectId: true })
    );

    if (!parseResult.success) {
      return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }

    try {
      const result = await getTraceCountForBackfill({ ...parseResult.data, projectId });
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
      }
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to get trace count." },
        { status: 500 }
      );
    }
  }

  const parseResult = parseUrlParams(
    request.nextUrl.searchParams,
    GetTraceIdsForBackfillSchema.omit({ projectId: true })
  );

  if (!parseResult.success) {
    return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getTraceIdsForBackfill({ ...parseResult.data, projectId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get trace IDs." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const body = await request.json();

    const parseResult = TriggerSemanticEventBackfillSchema.omit({ projectId: true }).safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }

    const result = await triggerSemanticEventBackfill({
      projectId,
      ...parseResult.data,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to trigger backfill." },
      { status: 500 }
    );
  }
}
