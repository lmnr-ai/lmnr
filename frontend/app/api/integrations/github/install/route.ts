import { type NextRequest, NextResponse } from "next/server";

import { autoLinkSingleRepo, getGithubIntegration, getProjectWorkspaceId } from "@/lib/actions/github";
import { getServerSession } from "@/lib/auth-session";
import { getWorkspaceRole } from "@/lib/authorization";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { mintConnectState } from "@/lib/github/state";
import { appUrl, installUrl, sanitizeReturnTo } from "@/lib/github/urls";

// Outside the proxy.ts matcher, so the session and role checks happen here.
export async function GET(request: NextRequest) {
  if (!isFeatureEnabled(Feature.GITHUB)) {
    return NextResponse.json({ error: "GitHub integration is not configured" }, { status: 404 });
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"), projectId);

  const session = await getServerSession();
  if (!session) {
    return NextResponse.redirect(appUrl(`/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`));
  }

  try {
    const workspaceId = await getProjectWorkspaceId(projectId);
    const role = workspaceId ? await getWorkspaceRole(workspaceId, session.user.id) : null;
    if (!workspaceId || !role) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Already connected: any member may go straight to the repo picker.
    if (await getGithubIntegration(workspaceId)) {
      await autoLinkSingleRepo(projectId).catch((e) => console.error("GitHub auto-link failed", e));
      return NextResponse.redirect(appUrl(returnTo, "connected"));
    }

    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Only workspace owners and admins can connect GitHub" }, { status: 403 });
    }

    const state = await mintConnectState({ userId: session.user.id, workspaceId, projectId, returnTo });
    return NextResponse.redirect(installUrl(state));
  } catch (e) {
    console.error("GitHub install start failed", e);
    return NextResponse.redirect(appUrl(returnTo, "error"));
  }
}
