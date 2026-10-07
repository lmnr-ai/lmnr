import { type NextRequest, NextResponse } from "next/server";

import { isTracePublic } from "@/lib/actions/trace";
import { auth } from "@/lib/auth";
import { isUserMemberOfProject, isUserMemberOfWorkspace } from "@/lib/authorization";
import { withBasePath } from "@/lib/utils";

export default async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/uploads/")) {
    const strapiUrl = process.env.STRAPI_URL || "http://localhost:1337";
    const destination = new URL(req.nextUrl.pathname + req.nextUrl.search, strapiUrl);
    return NextResponse.rewrite(destination);
  }

  // Degrade gracefully to unauthenticated on a transient DB failure: getSession
  // does a Postgres round-trip, and an unhandled rejection here would 500 every
  // matched request instead of falling back to the 401 / sign-in-redirect paths.
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  const userId = session?.user?.id;

  const projectIdMatch = req.nextUrl.pathname.match(/^\/api\/projects(?:\/([^/]+))?/);
  if (projectIdMatch) {
    if (!userId) {
      return NextResponse.json({ error: "Authentication required", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const projectId = projectIdMatch[1];
    if (projectId) {
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
    if (!userId) {
      return NextResponse.json({ error: "Authentication required", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const workspaceId = workspaceIdMatch[1];
    if (workspaceId) {
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

  // Authenticated app trees: redirect unauthenticated requests to /sign-in,
  // preserving the deep link as callbackUrl (legacy withAuth behaviour).
  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");
  const isUploads = req.nextUrl.pathname.startsWith("/uploads/");
  if (!isApiRoute && !isUploads && !userId) {
    // Middleware sees the basePath-stripped pathname, so callbackUrl stays
    // prefix-free (the sign-in page re-prefixes via router.push). The redirect
    // target itself must carry the prefix — new URL(absolutePath, base) drops it.
    const signInUrl = new URL(withBasePath("/sign-in"), req.url);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/projects",
    "/api/workspaces",
    "/api/projects/:path+",
    "/api/workspaces/:path+",
    "/api/shared/traces/:path+",
    "/uploads/:path+",
    // Authenticated app routes: withAuth redirects unauthenticated requests to
    // `/sign-in?callbackUrl=<original URL with query>`, preserving deep links
    // like `/invitations?token=...`. A Server Component layout can't read the
    // request pathname on its own, so the middleware is the only place that
    // can preserve the callback URL.
    "/projects",
    "/project/:path+",
    "/workspace/:path+",
    "/invitations",
    "/onboarding",
    "/checkout",
    "/device",
  ],
};
