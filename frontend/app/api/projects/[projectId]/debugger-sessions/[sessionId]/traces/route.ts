import { prettifyError, ZodError } from "zod/v4";

import { getSessionTraces } from "@/lib/actions/debugger-sessions";

export async function GET(
  _req: Request,
  props: { params: Promise<{ projectId: string; sessionId: string }> }
): Promise<Response> {
  const { projectId, sessionId } = await props.params;

  try {
    const items = await getSessionTraces({ projectId, sessionId });
    return Response.json({ items });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch session traces." },
      { status: 500 }
    );
  }
}
