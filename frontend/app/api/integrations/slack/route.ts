import { type NextRequest, NextResponse } from "next/server";

import { getWorkspaceSettingsPath } from "@/lib/actions/projects";
import { connectSlackIntegration, redeemBrokeredSlackToken } from "@/lib/actions/slack";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfWorkspace } from "@/lib/authorization";
import { BASE_PATH } from "@/lib/utils";

// NEXT_PUBLIC_URL is the operator's bare origin; the sub-path prefix is owned by
// BASE_PATH (NEXT_PUBLIC_BASE_PATH, baked at build). NextResponse.redirect is NOT
// auto-prefixed by Next, so absolute targets must be origin + BASE_PATH + path.
// Stripping to .origin first avoids double-stamping if the env URL already carries
// the sub-path. Same pattern as the invite link in lib/actions/workspace/invite.ts.
function prefixedBase(): string {
  return `${new URL(process.env.NEXT_PUBLIC_URL!).origin}${BASE_PATH}`;
}

function parseState(state: string): { workspaceId: string; returnPath?: string } {
  const colonIdx = state.indexOf(":");
  if (colonIdx === -1) {
    return { workspaceId: state };
  }
  return {
    workspaceId: state.substring(0, colonIdx),
    returnPath: state.substring(colonIdx + 1),
  };
}

function isRelativePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

async function buildRedirectUrl(workspaceId: string, returnPath?: string, error = false): Promise<string> {
  const base = prefixedBase();
  const status = error ? "slack=error" : "slack=success";

  if (returnPath && isRelativePath(returnPath)) {
    const separator = returnPath.includes("?") ? "&" : "?";
    return `${base}${returnPath}${separator}${status}`;
  }

  // No returnPath: resolve the workspace's project to land on its integrations settings.
  const settingsPath = await getWorkspaceSettingsPath(workspaceId, "integrations");
  const separator = settingsPath.includes("?") ? "&" : "?";
  return `${base}${settingsPath}${separator}${status}`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  // Brokered (self-hosted) path: the broker's /cb redirected here with the
  // workspaceId/returnPath this instance embedded in the returnUrl at /start,
  // plus either a one-time claim (success) or slack=error (failed/replayed
  // OAuth — no claim). The direct-OAuth path carries its context in `state` and
  // never sets a workspaceId query param, so its presence reliably marks the
  // brokered callback and ensures the error case also lands on the workspace
  // integrations page rather than falling through to the /projects fallback.
  const brokeredWorkspaceId = searchParams.get("workspaceId");
  if (brokeredWorkspaceId !== null) {
    const returnPath = searchParams.get("returnPath") ?? undefined;
    const claim = searchParams.get("claim");
    const slackStatus = searchParams.get("slack");
    if (slackStatus === "error" || !brokeredWorkspaceId || !claim) {
      return NextResponse.redirect(await buildRedirectUrl(brokeredWorkspaceId, returnPath, true));
    }
    // workspaceId rides in the URL (the broker echoes only claim + team), so bind
    // the claim to the authenticated caller's membership here: this callback is a
    // public OAuth redirect target, and without the check a user who completed
    // their own broker flow could rewrite workspaceId to any UUID and store their
    // bot token into a workspace they don't belong to.
    const session = await getServerSession();
    if (!session || !(await isUserMemberOfWorkspace(brokeredWorkspaceId, session.user.id))) {
      return NextResponse.redirect(await buildRedirectUrl(brokeredWorkspaceId, returnPath, true));
    }
    try {
      await redeemBrokeredSlackToken({ claim, workspaceId: brokeredWorkspaceId });
      return NextResponse.redirect(await buildRedirectUrl(brokeredWorkspaceId, returnPath));
    } catch (e) {
      console.error(e);
      return NextResponse.redirect(await buildRedirectUrl(brokeredWorkspaceId, returnPath, true));
    }
  }

  if (error || !code || !stateParam) {
    const parsed = stateParam ? parseState(stateParam) : null;
    return NextResponse.redirect(
      parsed
        ? await buildRedirectUrl(parsed.workspaceId, parsed.returnPath, true)
        : `${prefixedBase()}/projects?slack=error`
    );
  }

  const { workspaceId, returnPath } = parseState(stateParam);

  try {
    await connectSlackIntegration({ code, workspaceId });
    return NextResponse.redirect(await buildRedirectUrl(workspaceId, returnPath));
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(await buildRedirectUrl(workspaceId, returnPath, true));
  }
}
