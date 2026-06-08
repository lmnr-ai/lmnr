import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createProject } from "@/lib/actions/projects";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfWorkspace } from "@/lib/authorization";

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getServerSession();
  const user = session?.user;

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await req.json();

  // Authorize the caller against the TARGET workspace before creating a project
  // in it — otherwise any authenticated user can create a project (and seed
  // default charts) in an arbitrary workspace by POSTing a foreign workspaceId.
  if (!body.workspaceId || !(await isUserMemberOfWorkspace(body.workspaceId, user.id))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const project = await createProject({
      name: body.name,
      workspaceId: body.workspaceId,
    });

    return Response.json(project);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
