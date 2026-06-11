import { prettifyError, ZodError } from "zod/v4";

import { updateDebuggerSessionName } from "@/lib/actions/debugger-sessions";

export async function PATCH(
  req: Request,
  props: { params: Promise<{ projectId: string; sessionId: string }> }
): Promise<Response> {
  const { projectId, sessionId } = await props.params;

  try {
    const body = await req.json();
    const { name } = body;

    const session = await updateDebuggerSessionName({ projectId, id: sessionId, name });

    return Response.json(session);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to rename session. Please try again." },
      { status: 500 }
    );
  }
}
