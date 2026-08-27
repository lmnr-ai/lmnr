import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { DEFAULT_PROJECT_NAME, workspaceNameFromEmail } from "@/lib/actions/cli-auth/defaults";
import { createProject } from "@/lib/actions/projects";
import { createWorkspace } from "@/lib/actions/workspaces";
import { auth } from "@/lib/auth";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfProject } from "@/lib/authorization";
import { db } from "@/lib/db/drizzle";
import { deviceCodes, membersOfWorkspaces, projects, workspaces } from "@/lib/db/migrations/schema";
import { ascNameFold } from "@/lib/db/utils";
import { sendWelcomeEmail } from "@/lib/emails/utils";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

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
    // expiresAt is a Date because deviceCodes (and every BetterAuth table) is pinned to
    // mode: 'date' — the adapter inserts raw Date objects and would throw under 'string'.
    // The pin is re-applied on every `pnpm schema-pull:lint` by scripts/fix-auth-timestamp-modes.mjs.
    expiresAt: row.expiresAt.toISOString(),
    userId: row.userId,
  };
};

// Claim the user code for the current session (deviceVerify) — the protocol's
// verify-on-arrival step, run on /device page load. Binds the code to the
// signed-in user so consent is shown for a verified code. Best-effort here; the
// page gates the approve UI on whether the claim actually bound THIS user
// (context.userId === session user), so a failed/foreign claim surfaces on the
// page rather than as a dead-end at approve time.
export const claimUserCodeForCurrentSession = async (rawUserCode: string): Promise<void> => {
  const userCode = normalizeUserCode(rawUserCode);
  if (userCode.length === 0) return;
  try {
    await auth.api.deviceVerify({ query: { user_code: userCode }, headers: await headers() });
  } catch {
    // Invalid / expired codes surface via loadDeviceContext; an unbound claim
    // surfaces via the page's userId check.
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
    .orderBy(...ascNameFold(workspaces.name), ...ascNameFold(projects.name));
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
    .orderBy(...ascNameFold(workspaces.name));
};

// Resolves the project the CLI should be pointed at when the browser didn't send
// one — the zero-friction path where approving is the last step. Reuses an
// existing project when there is one, otherwise creates `dev` (in the user's
// workspace, or in a fresh workspace named after their email domain).
// `createdWorkspace` marks a brand-new account, which drives the welcome email.
const resolveDefaultProject = async (
  userEmail: string | null | undefined
): Promise<{ projectId: string; createdWorkspace: boolean } | { error: string }> => {
  const existingProjects = await listProjectsForCurrentSession();
  // Ordering matches the browser's default selection (workspace A→Z, project A→Z),
  // so a direct API caller that omits projectId lands on the same project the UI shows.
  if (existingProjects.length > 0) return { projectId: existingProjects[0].id, createdWorkspace: false };

  const existingWorkspaces = await listWorkspacesForCurrentSession();
  try {
    if (existingWorkspaces.length > 0) {
      const project = await createProject({ name: DEFAULT_PROJECT_NAME, workspaceId: existingWorkspaces[0].id });
      return { projectId: project.id, createdWorkspace: false };
    }

    const workspace = await createWorkspace({
      name: workspaceNameFromEmail(userEmail),
      projectName: DEFAULT_PROJECT_NAME,
      isFirstProject: true,
    });
    if (!workspace.projectId) return { error: "Failed to create a project" };
    return { projectId: workspace.projectId, createdWorkspace: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create a project" };
  }
};

// Approves the device code AND hands the chosen projectId back to the CLI.
//
// The projectId rides in the deviceCode `metadata` column; the /device/token
// route wrapper (app/api/auth/[...all]/route.ts) reads it just before BetterAuth
// deletes the row and forwards it to the polling CLI as the `x-lmnr-metadata`
// response header.
//
// ORDERING INVARIANT (fails silently if reversed): the metadata write MUST
// happen while the row is still status:"pending", BEFORE device.approve. If we
// wrote metadata after approve, the CLI poll could win the race in between,
// receive no metadata, and the row is then deleted at token issuance — the
// projectId is lost permanently. Sequence: update metadata (pending) -> approve.
//
// `projectId` is optional: the browser only sends one when the user actually has
// a choice (>1 project). Otherwise the project is resolved/created server-side so
// approving is the last step of CLI onboarding — nothing to name, nothing to pick.
export const approveDeviceWithProject = async (
  rawUserCode: string,
  projectId?: string
): Promise<{ error?: string }> => {
  const session = await getServerSession();
  if (!session?.user) return { error: "Unauthorized" };

  const userCode = normalizeUserCode(rawUserCode);
  if (userCode.length === 0) return { error: "Invalid code" };

  const context = await loadDeviceContext(userCode);
  if (!context) return { error: "We couldn't find that code." };
  if (context.status !== "pending") return { error: "This code has already been processed." };
  // The UI blocks expired codes, but the action is callable directly — reject an
  // expired code before writing metadata so a stale code can't be approved.
  if (new Date(context.expiresAt).getTime() < Date.now()) return { error: "This code has expired." };

  // The approver MUST be the user the code was claimed for on page load
  // (deviceVerify). Native deviceApprove enforces this too, but checking here
  // first avoids writing metadata onto a row this session can't approve. A null
  // userId (claim never bound) is rejected as well.
  if (context.userId !== session.user.id) return { error: "Unauthorized" };

  let targetProjectId = projectId;
  let sendWelcome = false;

  if (targetProjectId) {
    // Authorize project membership BEFORE the metadata write — the selector is
    // session-scoped but the projectId rides in from the client, so verify the
    // user actually belongs to it before storing it on the device row.
    // Fresh check (no cache): a since-removed user must not poison the row on a
    // stale 30-day cached `true`.
    const isMember = await isUserMemberOfProject(targetProjectId, session.user.id, { skipCache: true });
    if (!isMember) return { error: "You do not have access to this project" };
  } else {
    const resolved = await resolveDefaultProject(session.user.email);
    if ("error" in resolved) return { error: resolved.error };
    targetProjectId = resolved.projectId;
    // A user who had no workspace at all is a brand-new account, so send the
    // onboarding welcome email (onboarding parity); everyone else was welcomed before.
    sendWelcome = resolved.createdWorkspace;
  }

  // 1) Write the chosen project into `metadata` WHILE the row is pending.
  //    deviceApprove only writes { status, userId }, so this survives approve;
  //    the /device/token route wrapper (app/api/auth/[...all]/route.ts) forwards
  //    it to the polling CLI as the x-lmnr-metadata response header.
  await db
    .update(deviceCodes)
    .set({ metadata: JSON.stringify({ projectId: targetProjectId }) })
    .where(eq(deviceCodes.userCode, userCode));

  // 2) Now approve.
  try {
    await auth.api.deviceApprove({ body: { userCode }, headers: await headers() });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to approve device" };
  }

  // 3) Brand-new account onboarding parity: send the welcome email the onboarding
  //    wizard would have. Best-effort — never fail the approval on an email error.
  //    No-op unless RESEND_API_KEY is set (Feature.SEND_EMAIL), so self-hosted
  //    installs without email config are unaffected.
  if (sendWelcome && session.user.email && isFeatureEnabled(Feature.SEND_EMAIL)) {
    try {
      await sendWelcomeEmail(session.user.email);
    } catch {
      // Best-effort — sendWelcomeEmail logs Resend errors itself; never block approval.
    }
  }
  return {};
};
