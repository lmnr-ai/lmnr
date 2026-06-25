import { prettifyError, ZodError } from "zod/v4";

import { updateDebuggerSessionName } from "@/lib/actions/debugger-sessions";
import { updateDebuggerSessionVisibility } from "@/lib/actions/debugger-sessions/visibility";
import { NotFoundError } from "@/lib/errors";

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

    if (error instanceof NotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to rename session. Please try again." },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  props: { params: Promise<{ projectId: string; sessionId: string }> }
): Promise<Response> {
  const { projectId, sessionId } = await props.params;

  try {
    const body = await req.json();
    const visibility = body.visibility;

    if (visibility !== "public" && visibility !== "private") {
      return Response.json({ error: "visibility must be 'public' or 'private'" }, { status: 400 });
    }

    await updateDebuggerSessionVisibility({ sessionId, projectId, visibility });

    return Response.json({ visibility });
  } catch (error) {
    if (error instanceof Error && error.message === "Session not found") {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update session visibility." },
      { status: 500 }
    );
  }
}
