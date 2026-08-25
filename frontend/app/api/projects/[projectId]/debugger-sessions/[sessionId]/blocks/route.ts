import { prettifyError, ZodError } from "zod/v4";

import { getSessionBlocks, getSessionTraceRows } from "@/lib/actions/debugger-sessions";

// `GET …/blocks` → `{ blocks }` — lightweight ordered index (id-only trace refs).
export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; sessionId: string }> }
): Promise<Response> {
  const { projectId, sessionId } = await props.params;

  try {
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

// `POST …/blocks` with body `{ traceIds }` → `{ traces }` — window fetch of full
// rows. POST, not a query string, so a full id window can't overflow the URL.
export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; sessionId: string }> }
): Promise<Response> {
  const { projectId } = await props.params;

  try {
    const body = (await req.json().catch(() => ({}))) as { traceIds?: unknown };
    const traceIds = Array.isArray(body.traceIds)
      ? body.traceIds.filter((id): id is string => typeof id === "string")
      : [];
    const traces = await getSessionTraceRows({ projectId, traceIds });
    return Response.json({ traces });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch session trace rows." },
      { status: 500 }
    );
  }
}
