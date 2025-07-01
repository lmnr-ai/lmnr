import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { updateTraceVisibility } from "@/lib/actions/trace";
import { db } from "@/lib/db/drizzle";
import { traces } from "@/lib/db/migrations/schema";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const trace = await db.query.traces.findFirst({
    where: and(eq(traces.id, traceId), eq(traces.projectId, projectId)),
  });

  if (!trace) {
    return NextResponse.json({ error: "Trace not found" }, { status: 404 });
  }

  return NextResponse.json(trace);
}

export async function PUT(
  req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;

  const projectId = params.projectId;
  const traceId = params.traceId;

  const body = (await req.json()) as { visibility: "private" | "public" };

  try {
    await updateTraceVisibility({ projectId, visibility: body?.visibility, traceId });

    return NextResponse.json("Updated trace visibility successfully.");
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error updating visibility. Please try again." },
      {
        status: 500,
      }
    );
  }
}
