import { type NextRequest } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { listAccessibleWorkspaces } from "@/lib/oauth/user-access";
import { extractBearerToken, looksLikeJwt, verifyAccessToken } from "@/lib/oauth/verify";

interface Caller {
  userId: string;
  email: string | null;
  name: string | null;
}

async function resolveCaller(req: NextRequest): Promise<Caller | null> {
  // The CLI sends a freshly minted OAuth JWT Bearer; browser callers send
  // the NextAuth session cookie. Accept either.
  const bearer = extractBearerToken(req.headers.get("authorization"));
  if (bearer && looksLikeJwt(bearer)) {
    try {
      const claims = await verifyAccessToken(bearer);
      return { userId: claims.sub, email: claims.email, name: null };
    } catch {
      return null;
    }
  }
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}

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
