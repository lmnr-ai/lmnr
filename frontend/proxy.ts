import { NextResponse } from "next/server";
import { type NextRequestWithAuth, withAuth } from "next-auth/middleware";

import { isTracePublic } from "@/lib/actions/trace";
import { isUserMemberOfProject, isUserMemberOfWorkspace } from "@/lib/authorization";

export default withAuth(
  async function middleware(req: NextRequestWithAuth) {
    if (req.nextUrl.pathname.startsWith("/uploads/")) {
      const strapiUrl = process.env.STRAPI_URL || "http://localhost:1337";
      const destination = new URL(req.nextUrl.pathname + req.nextUrl.search, strapiUrl);
      return NextResponse.rewrite(destination);
    }

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
        const hasAccess = await isUserMemberOfWorkspace(workspaceId, userId);

        if (!hasAccess) {
          return NextResponse.json(
            { error: "You do not have access to this workspace", code: "FORBIDDEN" },
            { status: 403 }
          );
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
        if (req.nextUrl.pathname.startsWith("/uploads/")) {
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
    "/uploads/:path+",
    // Authenticated app trees — listed so NextAuth's built-in pages.signIn
    // redirect fires for unauthenticated deep links and appends
    // ?callbackUrl=<current-url>. Without this the (authenticated) layout's
    // server-component redirect("/sign-in") has no way to know the requested
    // path, and the user lands on the sign-in page's default destination
    // (/onboarding) after signing in. The middleware's `authorized` callback
    // already returns `!!token` for non-API/uploads paths, and the inline
    // regex checks above only match /api/* prefixes, so the body here is a
    // no-op for these routes beyond the auth redirect.
    "/projects",
    "/project/:path+",
    "/workspace/:path+",
    "/invitations",
  ],
};
