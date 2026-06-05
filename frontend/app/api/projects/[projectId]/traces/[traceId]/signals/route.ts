import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getTraceSignals } from "@/lib/actions/signals";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const { projectId, traceId } = await props.params;

  try {
    const result = await getTraceSignals({ projectId, traceId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch trace signals" },
      { status: 500 }
    );
  }
}
