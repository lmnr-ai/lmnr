import { type NextRequest } from "next/server";

import { getTraceUserInput } from "@/lib/actions/sessions/trace-io";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const { projectId, traceId } = await props.params;

  try {
    const input = await getTraceUserInput(traceId, projectId);
    return Response.json({ input });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
