import { getServerSession } from "next-auth";
import { prettifyError, ZodError } from "zod/v4";

import { updateProjectRemovePii } from "@/lib/actions/project";
import { authOptions } from "@/lib/auth";
import { isUserMemberOfProject } from "@/lib/authorization";

export async function PATCH(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;

  // Auth + project-ownership gate. Without this, any caller could toggle
  // `remove_pii` for an arbitrary project id (no app-level middleware
  // covers `/api/projects/...`) and silently disable redaction on someone
  // else's data. Use the JSON-friendly 401/403 path here rather than
  // `requireProjectAccess` (which redirects / 404s for the page tree).
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isUserMemberOfProject(projectId, userId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    await updateProjectRemovePii({ projectId, removePii: !!body?.removePii });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message === "PII redaction requires the Pro tier" ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
