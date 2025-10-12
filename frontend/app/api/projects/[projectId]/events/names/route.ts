import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getEventNames } from "@/lib/actions/events/paginated";

export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const result = await getEventNames(projectId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch event names." },
      { status: 500 }
    );
  }
}
