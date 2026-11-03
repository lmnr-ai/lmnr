import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

import { getWorkspaceSettingsPath } from "@/lib/actions/projects";
import { connectSlackIntegration, redeemBrokeredSlackToken } from "@/lib/actions/slack";
import { consumeSlackOauthState } from "@/lib/actions/slack/oauth-state";
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

// This callback is a public OAuth redirect target outside the proxy.ts matcher, and
// the brokered `workspaceId` param is attacker-controlled. Gate every branch on the
// browser's session being a member of the workspace, before storing a bot token or
// resolving the workspace's project ids for the redirect.
async function isAuthorizedForWorkspace(workspaceId: string): Promise<boolean> {
  if (!z.guid().safeParse(workspaceId).success) {
    return false;
  }
  const session = await getServerSession();
  return !!session && (await isUserMemberOfWorkspace(workspaceId, session.user.id));
}

function unauthorizedRedirect(): NextResponse {
  return NextResponse.redirect(`${prefixedBase()}/projects?slack=error`);
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
    if (!(await isAuthorizedForWorkspace(brokeredWorkspaceId))) {
      return unauthorizedRedirect();
    }
    const returnPath = searchParams.get("returnPath") ?? undefined;
    const claim = searchParams.get("claim");
    const slackStatus = searchParams.get("slack");
    if (slackStatus === "error" || !claim) {
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

  // Direct (Cloud) path: `state` is the opaque nonce minted by ./start. Only the
  // user who started the flow can consume it; workspace, returnPath, and the PKCE
  // verifier come from the server-side record, never from the URL.
  const session = await getServerSession();
  const flow = session && stateParam ? await consumeSlackOauthState(stateParam, session.user.id) : null;
  if (!flow || !(await isAuthorizedForWorkspace(flow.workspaceId))) {
    return unauthorizedRedirect();
  }

  const { workspaceId, returnPath, codeVerifier } = flow;
  if (error || !code) {
    return NextResponse.redirect(await buildRedirectUrl(workspaceId, returnPath, true));
  }

  try {
    await connectSlackIntegration({ code, workspaceId, codeVerifier });
    return NextResponse.redirect(await buildRedirectUrl(workspaceId, returnPath));
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(await buildRedirectUrl(workspaceId, returnPath, true));
  }
}
