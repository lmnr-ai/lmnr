import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getEventDefinition } from "@/lib/actions/event-definitions";

export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string; id: string }> }) {
  const params = await props.params;
  const { id, projectId } = params;

  try {
    const result = await getEventDefinition({ id, projectId });

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
