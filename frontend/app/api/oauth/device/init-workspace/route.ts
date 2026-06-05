import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, z, ZodError } from "zod/v4";

import { createWorkspaceForUser } from "@/lib/actions/workspaces";
import { authOptions } from "@/lib/auth";
import { listAccessibleWorkspaces } from "@/lib/oauth/user-access";

const BodySchema = z.object({
  workspaceName: z.string().min(1).max(255),
  projectName: z.string().min(1).max(255),
});

/**
 * Bootstrap a workspace + project for a freshly-signed-up user mid OAuth
 * device-flow approval. Without this, the approval page renders "no projects
 * available" because every JWT is project-scoped, leaving the user stranded.
 *
 * Session-authed (the user is on the approval page in a browser).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    // Guard against re-creating workspaces for users who already have one.
    // Existing users follow the picker UI; this endpoint is the empty-account path.
    const existing = await listAccessibleWorkspaces(session.user.id);
    if (existing.length > 0) {
      return Response.json({ error: "user_has_workspace" }, { status: 409 });
    }

    const result = await createWorkspaceForUser({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      name: body.workspaceName,
      projectName: body.projectName,
    });

    if (!result.projectId) {
      return Response.json({ error: "project_create_failed" }, { status: 500 });
    }
    return Response.json({
      workspaceId: result.id,
      workspaceName: result.name,
      projectId: result.projectId,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
