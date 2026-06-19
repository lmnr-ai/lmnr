import { prettifyError, ZodError } from "zod/v4";

import { updateProjectSettings } from "@/lib/actions/project/settings";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfProject } from "@/lib/authorization";

export async function PATCH(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;

  // Auth + project-ownership gate. Without it, any caller could mutate
  // settings for an arbitrary project id (no app-level middleware covers
  // `/api/projects/...`). Use 401/403 JSON rather than `requireProjectAccess`
  // (which redirects / 404s for the page tree).
  const session = await getServerSession();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isUserMemberOfProject(projectId, userId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    await updateProjectSettings({ projectId, settings: body?.settings ?? {} });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message === "This setting requires the Pro tier" ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
