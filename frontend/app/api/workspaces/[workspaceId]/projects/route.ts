import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createProject, getProjectsByWorkspace } from "@/lib/actions/projects";

export async function GET(_req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const { workspaceId } = params;

    const projects = await getProjectsByWorkspace(workspaceId);

    return Response.json(projects);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to get projects. Please try again." },
      { status: 500 }
    );
  }
}

// Auth: proxy.ts gates /api/workspaces/:workspaceId/* via isUserMemberOfWorkspace,
// so a non-member never reaches this handler — no in-handler authz needed.
export async function POST(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const { workspaceId } = await props.params;
  const body = await req.json();
  try {
    const project = await createProject({ name: body.name, workspaceId });
    return Response.json(project);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
