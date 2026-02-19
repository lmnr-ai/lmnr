import { NextResponse } from "next/server";
import { type NextRequestWithAuth, withAuth } from "next-auth/middleware";

import { isTracePublic } from "@/lib/actions/trace";
import { getWorkspaceRole, isUserMemberOfProject, isUserMemberOfWorkspace } from "@/lib/authorization";

export default withAuth(
  async function middleware(req: NextRequestWithAuth) {
    const token = req.nextauth.token;

    const projectIdMatch = req.nextUrl.pathname.match(/^\/api\/projects(?:\/([^/]+))?/);
    if (projectIdMatch) {
      if (!token) {
        return NextResponse.json({ error: "Authentication required", code: "UNAUTHENTICATED" }, { status: 401 });
      }

      const projectId = projectIdMatch[1];
      if (projectId) {
        const userId = token.userId as string;
        const hasAccess = await isUserMemberOfProject(projectId, userId);

        if (!hasAccess) {
          return NextResponse.json(
            { error: "You do not have access to this project", code: "FORBIDDEN" },
            { status: 403 }
          );
        }
      }
    }

    const workspaceIdMatch = req.nextUrl.pathname.match(/^\/api\/workspaces(?:\/([^/]+))?/);
    if (workspaceIdMatch) {
      if (!token) {
        return NextResponse.json({ error: "Authentication required", code: "UNAUTHENTICATED" }, { status: 401 });
      }

      const workspaceId = workspaceIdMatch[1];
      if (workspaceId) {
        const userId = token.userId as string;

        // Routes under /addons require owner or admin role
        const isAddonRoute = /^\/api\/workspaces\/[^/]+\/addons/.test(req.nextUrl.pathname);
        if (isAddonRoute) {
          const role = await getWorkspaceRole(workspaceId, userId);
          if (!role) {
            return NextResponse.json(
              { error: "You do not have access to this workspace", code: "FORBIDDEN" },
              { status: 403 }
            );
          }
          if (role !== "owner" && role !== "admin") {
            return NextResponse.json(
              { error: "Only workspace owners and admins can manage addons", code: "FORBIDDEN" },
              { status: 403 }
            );
          }
        } else {
          const hasAccess = await isUserMemberOfWorkspace(workspaceId, userId);
          if (!hasAccess) {
            return NextResponse.json(
              { error: "You do not have access to this workspace", code: "FORBIDDEN" },
              { status: 403 }
            );
          }
        }
      }
    }

    const traceMatch = req.nextUrl.pathname.match(/^\/api\/shared\/traces\/([^/]+)/);
    if (traceMatch) {
      const traceId = traceMatch[1];
      const isPublic = await isTracePublic(traceId);

      if (!isPublic) {
        return NextResponse.json({ error: "Trace not found or not public", code: "NOT_FOUND" }, { status: 404 });
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // if false returns redirect, let return true and handle for proper errors in case.
        if (req.nextUrl.pathname.startsWith("/api/")) {
          return true;
        }
        return !!token;
      },
    },
    pages: {
      signIn: "/sign-in",
    },
  }
);

export const config = {
  matcher: [
    "/api/projects",
    "/api/workspaces",
    "/api/projects/:path+",
    "/api/workspaces/:path+",
    "/api/shared/traces/:path+",
  ],
};
