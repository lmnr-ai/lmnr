import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getTraceRenderData } from "@/lib/actions/trace/render-data";

// fetcherJSON throws with the raw backend response body, which for query-engine
// rejections is a JSON string like {"error":"Query validation failed: ..."}.
const unwrapErrorMessage = (message: string): string => {
  try {
    const parsed = JSON.parse(message);
    return typeof parsed?.error === "string" ? parsed.error : message;
  } catch {
    return message;
  }
};

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, traceId } = params;

  try {
    const body = await req.json();

    const result = await getTraceRenderData({
      projectId,
      traceId,
      whereClause: body.whereClause,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? unwrapErrorMessage(error.message) : "Failed to fetch trace render data." },
      { status: 500 }
    );
  }
}
