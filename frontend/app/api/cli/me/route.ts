import { type NextRequest } from "next/server";

import { resolveCaller } from "@/lib/oauth/resolve-caller";
import { listAccessibleWorkspaces } from "@/lib/oauth/user-access";

export async function GET(req: NextRequest): Promise<Response> {
  const caller = await resolveCaller(req);
  if (!caller) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspaces = await listAccessibleWorkspaces(caller.userId);
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
      user: { id: caller.userId, email: caller.email, name: caller.name },
      workspaces,
      project,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
