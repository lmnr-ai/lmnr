import { NextResponse } from "next/server";
import { NextRequestWithAuth, withAuth } from "next-auth/middleware";

import { isTracePublic } from "@/lib/actions/trace";
import { isUserMemberOfProject, isUserMemberOfWorkspace } from "@/lib/authorization";

export default withAuth(
  async function middleware(req: NextRequestWithAuth) {
    const token = req.nextauth.token;

    if (!token) {
      return NextResponse.json({ error: "Authentication required", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const userId = token.userId as string;

    const projectIdMatch = req.nextUrl.pathname.match(/^\/api\/projects\/([^\/]+)/);
    if (projectIdMatch) {
      const projectId = projectIdMatch[1];
      const hasAccess = await isUserMemberOfProject(projectId, userId);

      if (!hasAccess) {
        return NextResponse.json(
          { error: "You do not have access to this project", code: "FORBIDDEN" },
          { status: 403 }
        );
      }
    }

    const workspaceIdMatch = req.nextUrl.pathname.match(/^\/api\/workspaces\/([^\/]+)/);
    if (workspaceIdMatch) {
      const workspaceId = workspaceIdMatch[1];
      const hasAccess = await isUserMemberOfWorkspace(workspaceId, userId);

      if (!hasAccess) {
        return NextResponse.json(
          { error: "You do not have access to this workspace", code: "FORBIDDEN" },
          { status: 403 }
        );
      }
    }

    const traceMatch = req.nextUrl.pathname.match(/^\/api\/shared\/traces\/([^\/]+)/);
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
  matcher: ["/api/projects", "/api/workspaces", "/api/projects/:path+", "/api/workspaces/:path+", "/api/shared/traces/:path+"],
  runtime: "nodejs",
};
