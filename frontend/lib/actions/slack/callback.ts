import { z } from "zod/v4";

import { getWorkspaceSettingsPath } from "@/lib/actions/projects";
import { getServerSession, type ServerSession } from "@/lib/auth-session";
import { isUserMemberOfWorkspace } from "@/lib/authorization";
import { BASE_PATH } from "@/lib/utils";

// NEXT_PUBLIC_URL is the operator's bare origin; the sub-path prefix is owned by
// BASE_PATH (NEXT_PUBLIC_BASE_PATH, baked at build). NextResponse.redirect is NOT
// auto-prefixed by Next, so absolute targets must be origin + BASE_PATH + path.
// Stripping to .origin first avoids double-stamping if the env URL already carries
// the sub-path. Same pattern as the invite link in lib/actions/workspace/invite.ts.
export function prefixedBase(): string {
  const origin = process.env.NEXT_PUBLIC_URL ? new URL(process.env.NEXT_PUBLIC_URL).origin : "http://localhost:3000";
  return `${origin}${BASE_PATH}`;
}

export function parseState(state: string): { workspaceId: string; returnPath?: string } {
  const colonIdx = state.indexOf(":");
  if (colonIdx === -1) {
    return { workspaceId: state };
  }
  return {
    workspaceId: state.substring(0, colonIdx),
    returnPath: state.substring(colonIdx + 1),
  };
}

export function isRelativePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

export async function buildRedirectUrl(workspaceId: string, returnPath?: string, error = false): Promise<string> {
  const base = prefixedBase();
  const status = error ? "slack=error" : "slack=success";

  if (returnPath && isRelativePath(returnPath)) {
    const separator = returnPath.includes("?") ? "&" : "?";
    return `${base}${returnPath}${separator}${status}`;
  }

  if (workspaceId && z.guid().safeParse(workspaceId).success) {
    // No returnPath: resolve the workspace's project to land on its integrations settings.
    const settingsPath = await getWorkspaceSettingsPath(workspaceId, "integrations");
    const separator = settingsPath.includes("?") ? "&" : "?";
    return `${base}${settingsPath}${separator}${status}`;
  }

  return `${base}/projects?${status}`;
}

/**
 * Validates that workspaceId is a valid UUID, the user is authenticated, and the
 * user is an active member of the specified workspace.
 *
 * Both the direct Slack OAuth callback (where workspaceId rides in stateParam) and
 * the brokered callback (where workspaceId rides in the redirect URL) are public OAuth
 * endpoints. Without verifying caller membership, an attacker could supply an arbitrary
 * victim workspaceId and connect their Slack bot token to hijack notifications/alerts.
 */
export async function authorizeSlackCallbackWorkspace(
  workspaceId: string,
  deps: {
    getSession?: () => Promise<ServerSession | null>;
    checkMembership?: (workspaceId: string, userId: string) => Promise<boolean>;
  } = {}
): Promise<{ authorized: boolean; reason?: string }> {
  if (!z.guid().safeParse(workspaceId).success) {
    return { authorized: false, reason: "invalid_workspace_id" };
  }

  const getSession = deps.getSession ?? getServerSession;
  const checkMembership = deps.checkMembership ?? isUserMemberOfWorkspace;

  const session = await getSession();
  if (!session) {
    return { authorized: false, reason: "unauthenticated" };
  }

  const isMember = await checkMembership(workspaceId, session.user.id);
  if (!isMember) {
    return { authorized: false, reason: "unauthorized" };
  }

  return { authorized: true };
}
