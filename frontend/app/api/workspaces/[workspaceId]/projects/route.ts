import { NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getProjectsByWorkspace } from "@/lib/actions/projects";
import { isCurrentUserMemberOfWorkspace } from "@/lib/db/utils";

export async function GET(_req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const { workspaceId } = params;

    if (!(await isCurrentUserMemberOfWorkspace(workspaceId))) {
      return Response.json({ error: "Unauthorized: User is not a member of this workspace" }, { status: 403 });
    }

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
