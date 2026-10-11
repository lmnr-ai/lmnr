import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { getSessionTraceNeighbors, GetSessionTraceNeighborsSchema } from "@/lib/actions/sessions";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; sessionId: string }> }
): Promise<Response> {
  const { projectId, sessionId } = await props.params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetSessionTraceNeighborsSchema.omit({ projectId: true, sessionId: true })
  );
  if (!parseResult.success) {
    return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getSessionTraceNeighbors({ ...parseResult.data, projectId, sessionId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch session neighbors." },
      { status: 500 }
    );
  }
}
