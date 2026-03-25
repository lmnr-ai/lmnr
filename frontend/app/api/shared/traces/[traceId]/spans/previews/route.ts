import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSpanPreviews } from "@/lib/actions/spans/outputs.ts";
import { db } from "@/lib/db/drizzle.ts";
import { sharedTraces } from "@/lib/db/migrations/schema.ts";

export async function POST(req: NextRequest, props: { params: Promise<{ traceId: string }> }): Promise<Response> {
  const params = await props.params;
  const { traceId } = params;

  try {
    const body = await req.json();
    const { spanIds, spanTypes, startDate, endDate } = body;

    const sharedTrace = await db.query.sharedTraces.findFirst({
      where: eq(sharedTraces.id, traceId),
    });

    if (!sharedTrace) {
      return NextResponse.json({ error: "No shared trace found." }, { status: 404 });
    }

    const previews = await getSpanPreviews({
      projectId: sharedTrace.projectId,
      traceId,
      spanIds,
      spanTypes,
      startDate,
      endDate,
    });

    return NextResponse.json({ previews });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate span previews." },
      { status: 500 }
    );
  }
}
