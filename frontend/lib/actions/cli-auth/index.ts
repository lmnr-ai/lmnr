import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfProject } from "@/lib/authorization";
import { db } from "@/lib/db/drizzle";
import { deviceCodes, membersOfWorkspaces, projects, workspaces } from "@/lib/db/migrations/schema";

import { buildProjectScope } from "./scope";

export interface SessionProject {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
}

export interface SessionWorkspace {
  id: string;
  name: string;
}

export interface DeviceApprovalContext {
  userCode: string;
  status: "pending" | "approved" | "denied";
  clientId: string | null;
  scope: string | null;
  expiresAt: string;
  userId: string | null;
}

// Strip dashes — BetterAuth stores user codes without separators.
const normalizeUserCode = (raw: string): string => raw.replace(/-/g, "").toUpperCase();

export const loadDeviceContext = async (rawUserCode: string): Promise<DeviceApprovalContext | null> => {
  const userCode = normalizeUserCode(rawUserCode);
  if (userCode.length === 0) return null;
  const [row] = await db
    .select({
      userCode: deviceCodes.userCode,
      status: deviceCodes.status,
      clientId: deviceCodes.clientId,
      scope: deviceCodes.scope,
      expiresAt: deviceCodes.expiresAt,
      userId: deviceCodes.userId,
    })
    .from(deviceCodes)
    .where(eq(deviceCodes.userCode, userCode))
    .limit(1);
  if (!row) return null;
  return {
    userCode: row.userCode,
    status: row.status as DeviceApprovalContext["status"],
    clientId: row.clientId,
    scope: row.scope,
    expiresAt: row.expiresAt.toISOString(),
    userId: row.userId,
  };
};

// Claim the user code for the current session. BetterAuth's GET /api/auth/device
// does this server-side; we call it via the SDK so the session cookie / Origin
// rules are handled identically to the browser flow.
export const claimUserCodeForCurrentSession = async (rawUserCode: string): Promise<void> => {
  const userCode = normalizeUserCode(rawUserCode);
  if (userCode.length === 0) return;
  try {
    await auth.api.deviceVerify({ query: { user_code: userCode }, headers: await headers() });
  } catch {
    // Claim is best-effort — invalid / expired codes surface as banner errors
    // via loadDeviceContext.
  }
};

// Projects the current session's user can access. Used by the /device picker
// step. Session-scoped (cookie), NOT the CLI JWT — do not call /v1/cli/projects
// from the browser. Mirrors the no-projectId query in /api/cli/api-key.
export const listProjectsForCurrentSession = async (): Promise<SessionProject[]> => {
  const session = await getServerSession();
  if (!session?.user) return [];
  return db
    .select({
      id: projects.id,
      name: projects.name,
      workspaceId: projects.workspaceId,
      workspaceName: workspaces.name,
    })
    .from(projects)
    .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
    .innerJoin(membersOfWorkspaces, and(eq(membersOfWorkspaces.workspaceId, workspaces.id)))
    .where(eq(membersOfWorkspaces.userId, session.user.id))
    .orderBy(asc(workspaces.name), asc(projects.name));
};

// Workspaces the current session's user belongs to. Used by the /device picker's
// create-project modal (workspace selector + the 0-workspace brand-new-user case),
// which can't be derived from projects when the user has none. Session-scoped.
export const listWorkspacesForCurrentSession = async (): Promise<SessionWorkspace[]> => {
  const session = await getServerSession();
  if (!session?.user) return [];
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
    })
    .from(workspaces)
    .innerJoin(membersOfWorkspaces, eq(membersOfWorkspaces.workspaceId, workspaces.id))
    .where(eq(membersOfWorkspaces.userId, session.user.id))
    .orderBy(asc(workspaces.name));
};

// Approves the device code AND smuggles the chosen projectId back to the CLI.
//
// `lmnr_project=<uuid>` is NOT a permission scope — it's metadata riding the
// `scope` field because that is the ONLY field BetterAuth's device-token poll
// echoes verbatim back to the CLI (routes.mjs deviceToken handler). The CLI
// parser tolerates token order and ignores the real `projects:rw`.
//
// ORDERING INVARIANT (fails silently if reversed): the scope write MUST happen
// while the row is still status:"pending", BEFORE device.approve. If we wrote
// scope after approve, the CLI poll could win the race in between, receive a
// scope with no project, and the row is then deleted at token issuance — the
// projectId is lost permanently. Sequence: update scope (pending) -> approve.
export const approveDeviceWithProject = async (rawUserCode: string, projectId: string): Promise<{ error?: string }> => {
  const session = await getServerSession();
  if (!session?.user) return { error: "Unauthorized" };

  const userCode = normalizeUserCode(rawUserCode);
  if (userCode.length === 0) return { error: "Invalid code" };

  const context = await loadDeviceContext(userCode);
  if (!context) return { error: "We couldn't find that code." };
  if (context.status !== "pending") return { error: "This code has already been processed." };
  // The UI blocks expired codes, but the action is callable directly — reject an
  // expired code before writing scope so a stale code can't be approved.
  if (new Date(context.expiresAt).getTime() < Date.now()) return { error: "This code has expired." };

  // Authorize project membership BEFORE the scope write — the picker is
  // session-scoped but the projectId rides in from the client, so verify the
  // user actually belongs to it before smuggling it into the device scope.
  // Fresh check (no cache): a since-removed user must not poison the scope on a
  // stale 30-day cached `true`.
  const isMember = await isUserMemberOfProject(projectId, session.user.id, { skipCache: true });
  if (!isMember) return { error: "You do not have access to this project" };

  // 1) Write the chosen project into `scope` WHILE the row is pending. deviceApprove
  //    only writes { status, userId } so this survives the approve.
  await db
    .update(deviceCodes)
    .set({ scope: buildProjectScope(projectId) })
    .where(eq(deviceCodes.userCode, userCode));

  // 2) Now approve. The token poll echoes the scope written above.
  try {
    await auth.api.deviceApprove({ body: { userCode }, headers: await headers() });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to approve device" };
  }
  return {};
};
