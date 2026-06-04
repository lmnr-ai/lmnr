import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { listAccessibleWorkspaces } from "@/lib/oauth/user-access";

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspaces = await listAccessibleWorkspaces(session.user.id);
    const requestedProjectId = req.nextUrl.searchParams.get("projectId");

    let project: { id: string; name: string; workspaceId: string; workspaceName: string } | null = null;
    if (requestedProjectId) {
      for (const ws of workspaces) {
        const found = ws.projects.find((p) => p.id === requestedProjectId);
        if (found) {
          project = { id: found.id, name: found.name, workspaceId: ws.id, workspaceName: ws.name };
          break;
        }
      }
    }

    return Response.json({
      user: { id: session.user.id, email: session.user.email, name: session.user.name },
      workspaces,
      project,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
