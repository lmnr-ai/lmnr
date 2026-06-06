import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prettifyError, ZodError } from "zod/v4";

import { createProject, getProjectsByWorkspace } from "@/lib/actions/projects";
import { authOptions } from "@/lib/auth";

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

export async function POST(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspaceId } = await props.params;
    const body = (await req.json()) as { name?: string };

    const project = await createProject({
      name: body.name ?? "",
      workspaceId,
      subscriberEmail: session.user.email ?? undefined,
    });

    return Response.json(project);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create project." },
      { status: 500 }
    );
  }
}
