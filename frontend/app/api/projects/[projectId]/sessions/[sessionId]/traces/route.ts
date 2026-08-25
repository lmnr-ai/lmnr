import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSessionTraces } from "@/lib/actions/sessions";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; sessionId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, sessionId } = params;

  try {
    const result = await getSessionTraces({ projectId, sessionId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch session traces." },
      { status: 500 }
    );
  }
}
