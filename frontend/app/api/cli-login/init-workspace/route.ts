import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, z, ZodError } from "zod/v4";

import { createWorkspace, listAccessibleWorkspaces } from "@/lib/actions/workspaces";
import { authOptions } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/cli-login/csrf";
import { parseJsonBody } from "@/lib/cli-login/parse-body";

const BodySchema = z
  .object({
    workspaceName: z.string().min(1).max(255),
    projectName: z.string().min(1).max(255),
  })
  .strict();

// Bootstrap a workspace + project for a freshly-signed-up (0-workspace) user
// mid CLI-login approval, so the picker has a project to scope the key to.
// Session-authed (the user is on the approval page in a browser).
export async function POST(req: NextRequest): Promise<Response> {
  const originBlocked = requireSameOrigin(req);
  if (originBlocked) return originBlocked;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const parsed = await parseJsonBody(req);
    if ("error" in parsed) return parsed.error;
    const body = BodySchema.parse(parsed.data);

    const existing = await listAccessibleWorkspaces(session.user.id);
    if (existing.length > 0) {
      return Response.json({ error: "user_has_workspace" }, { status: 409 });
    }

    const result = await createWorkspace({
      name: body.workspaceName,
      projectName: body.projectName,
      isFirstProject: true,
    });
    if (!result.projectId) {
      return Response.json({ error: "project_create_failed" }, { status: 500 });
    }
    return Response.json({ workspaceId: result.id, workspaceName: result.name, projectId: result.projectId });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
