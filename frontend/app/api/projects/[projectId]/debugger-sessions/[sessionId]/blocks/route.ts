import { prettifyError, ZodError } from "zod/v4";

import { getSessionBlocks, getSessionTraceRows } from "@/lib/actions/debugger-sessions";

// Mode-multiplexed by query string (same pattern as the queue items route):
// `?traceIds=<csv>` returns `{ traces }` — full rows for those ids only (the
// virtualized timeline's window fetch); no `traceIds` returns `{ blocks }` —
// the lightweight ordered index (trace blocks are id-only refs).
export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; sessionId: string }> }
): Promise<Response> {
  const { projectId, sessionId } = await props.params;
  const traceIdsParam = new URL(req.url).searchParams.get("traceIds");

  try {
    if (traceIdsParam !== null) {
      const traceIds = traceIdsParam.split(",").filter(Boolean);
      const traces = await getSessionTraceRows({ projectId, traceIds });
      return Response.json({ traces });
    }
    const blocks = await getSessionBlocks({ projectId, sessionId });
    return Response.json({ blocks });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch session blocks." },
      { status: 500 }
    );
  }
}
