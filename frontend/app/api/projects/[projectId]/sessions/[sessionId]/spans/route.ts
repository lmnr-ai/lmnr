import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { getSessionSpans, GetSessionSpansSchema } from "@/lib/actions/sessions/search-spans";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; sessionId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, sessionId } = params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetSessionSpansSchema.omit({ projectId: true, sessionId: true })
  );

  if (!parseResult.success) {
    return NextResponse.json({ traces: [] });
  }

  try {
    const result = await getSessionSpans({
      ...parseResult.data,
      projectId,
      sessionId,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to search session spans." },
      { status: 500 }
    );
  }
}
