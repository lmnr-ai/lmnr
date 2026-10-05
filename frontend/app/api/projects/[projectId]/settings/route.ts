import { prettifyError, ZodError } from "zod/v4";

import { getProjectWorkspaceId } from "@/lib/actions/project";
import { updateProjectSettings } from "@/lib/actions/project/settings";
import { getServerSession } from "@/lib/auth-session";
import { getWorkspaceRole, isUserMemberOfProject } from "@/lib/authorization";

/// Settings only workspace owners/admins may change. `piiMode` decides what
/// every other member gets to see, so a member must not be able to flip it.
const PRIVILEGED_KEYS = new Set(["piiMode"]);

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
    const settings = body?.settings ?? {};

    if (Object.keys(settings).some((key) => PRIVILEGED_KEYS.has(key))) {
      const workspaceId = await getProjectWorkspaceId(projectId);
      const role = workspaceId ? await getWorkspaceRole(workspaceId, userId) : null;
      if (role !== "owner" && role !== "admin") {
        return Response.json({ error: "Only workspace owners and admins can change this setting" }, { status: 403 });
      }
    }

    await updateProjectSettings({ projectId, settings });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status =
      message === "This setting requires the Pro tier" || message === "Dual PII mode is not enabled on this deployment"
        ? 403
        : 500;
    return Response.json({ error: message }, { status });
  }
}
