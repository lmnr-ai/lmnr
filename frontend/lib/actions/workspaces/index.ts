import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { z } from "zod/v4";

import { createProject } from "@/lib/actions/projects";
import { REPORT_TARGET_TYPE } from "@/lib/actions/reports/types";
import { authOptions } from "@/lib/auth";
import { defaultReports } from "@/lib/db/default-charts.ts";
import { db } from "@/lib/db/drizzle";
import {
  membersOfWorkspaces,
  projects,
  reports,
  reportTargets,
  subscriptionTiers,
  workspaceAddons,
  workspaces,
} from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { type AccessibleWorkspace, type Workspace, WorkspaceTier } from "@/lib/workspaces/types";

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required"),
  projectName: z.string().optional(),
});

type CreateWorkspaceResult = {
  id: string;
  name: string;
  tierName: WorkspaceTier;
  projectId?: string;
};

export const createWorkspace = async (input: z.infer<typeof CreateWorkspaceSchema>): Promise<CreateWorkspaceResult> => {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const parsed = CreateWorkspaceSchema.parse(input);
  return createWorkspaceForUser({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    ...parsed,
  });
};

export interface CreateWorkspaceForUserInput {
  userId: string;
  userEmail: string | null;
  name: string;
  projectName?: string;
  /**
   * When true, take a Postgres advisory lock keyed by `hashtext(userId)` at
   * the start of the workspace transaction and recheck inside the lock that
   * the user still has zero memberships. Used by the OAuth device-flow
   * bootstrap path where parallel POSTs from a 0-workspace user must not
   * both succeed. Wizard / generic callers leave this false.
   *
   * Returns `existingWorkspaceConflict` (instead of inserting a duplicate)
   * when the lock revealed the user now has memberships.
   */
  requireFirstWorkspace?: boolean;
}

export class ExistingWorkspaceConflict extends Error {
  constructor() {
    super("user_has_workspace");
    this.name = "ExistingWorkspaceConflict";
  }
}

/**
 * Session-free workspace creation, shared by the CLI setup path
 * (`POST /api/cli/setup`), the OAuth device-flow bootstrap, and the
 * onboarding wizard. Every workspace gets:
 * - owner membership for `userId`
 * - default report rows (one per `defaultReports` entry)
 * - EMAIL report targets for `userEmail` on those reports (when supplied)
 * - if `projectName` is set, an initial project created via `createProject`,
 *   which is where per-project defaults (Failure Detector signal, trigger,
 *   alert + email target) live.
 *
 * Any "every workspace has X" default belongs here, NOT in caller code.
 * Wizard-only side effects (welcome email, PostHog funnel events) stay in
 * the wizard's caller — they are UX moments, not universal defaults.
 *
 * TODO(wizard-vs-setup): revisit the wizard-only list and decide which
 * items should move into the shared creation path. Current wizard-only
 * side effects (in `components/onboarding/use-onboarding-actions.ts` and
 * `app/api/projects/[projectId]/onboarding/state/route.ts`):
 *   - Welcome email send (DELETE on onboarding completion)
 *   - PostHog `onboarding:*` funnel events
 *   - Resume-cookie persistence (wizard-specific — CLI has no resume state)
 *   - Slack integration prompt
 * Anything promoted to "every workspace has X" moves here; do NOT add a
 * second call site in the CLI setup route.
 */
export const createWorkspaceForUser = async (input: CreateWorkspaceForUserInput): Promise<CreateWorkspaceResult> => {
  const { userId, userEmail, name, projectName, requireFirstWorkspace } = input;

  // workspace + owner membership + default reports + report targets must
  // succeed or fail as a unit. Otherwise a failure between the workspace
  // insert and the membership insert leaves an orphan workspace row that
  // no user can see or delete.
  const workspace = await db.transaction(async (tx) => {
    // Advisory lock serializes any two callers that pass the same userId,
    // so the recheck below sees committed state from a racing first call.
    // `pg_advisory_xact_lock` releases automatically at transaction end.
    if (requireFirstWorkspace) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
      const [existing] = await tx
        .select({ workspaceId: membersOfWorkspaces.workspaceId })
        .from(membersOfWorkspaces)
        .where(eq(membersOfWorkspaces.userId, userId))
        .limit(1);
      if (existing) {
        throw new ExistingWorkspaceConflict();
      }
    }

    const [row] = await tx
      .insert(workspaces)
      .values({
        name,
        tierId: 1,
      })
      .returning({
        id: workspaces.id,
        name: workspaces.name,
      });

    if (!row) {
      throw new Error("Failed to create workspace");
    }

    await tx.insert(membersOfWorkspaces).values({
      userId,
      workspaceId: row.id,
      memberRole: "owner",
    });

    const insertedReports = await tx
      .insert(reports)
      .values(
        defaultReports.map((r) => ({
          workspaceId: row.id,
          type: r.type,
          weekdays: r.weekdays,
          hour: r.hour,
        }))
      )
      .returning({ id: reports.id });

    if (userEmail && insertedReports.length > 0) {
      await tx.insert(reportTargets).values(
        insertedReports.map((r) => ({
          workspaceId: row.id,
          reportId: r.id,
          type: REPORT_TARGET_TYPE.EMAIL,
          email: userEmail,
        }))
      );
    }

    return row;
  });

  let projectId: string | undefined;

  // createProject opens its own transaction (default-charts + Failure
  // Detector signal seed are its concern). Kept outside the workspace
  // transaction so a project-creation failure does not roll back the
  // workspace; the user can retry project creation from the UI.
  if (projectName) {
    const project = await createProject({
      name: projectName,
      workspaceId: workspace.id,
      subscriberEmail: userEmail ?? undefined,
    });
    projectId = project.id;
  }

  return {
    id: workspace.id,
    name: workspace.name,
    tierName: WorkspaceTier.FREE,
    projectId,
  };
};

/**
 * Session-free workspace + project listing keyed by userId. Used by the
 * OAuth/CLI surfaces (`/api/cli/*`, device approval page) where the caller
 * is authenticated via JWT bearer, not a NextAuth session. The session-authed
 * UI listing is `getWorkspaces` below — they share the membership join; keep
 * the `membersOfWorkspaces` predicates in sync when membership semantics
 * change.
 */
export const listAccessibleWorkspaces = async (userId: string): Promise<AccessibleWorkspace[]> => {
  const rows = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(workspaces)
    .innerJoin(membersOfWorkspaces, eq(workspaces.id, membersOfWorkspaces.workspaceId))
    .leftJoin(projects, eq(projects.workspaceId, workspaces.id))
    .where(eq(membersOfWorkspaces.userId, userId))
    .orderBy(asc(workspaces.name), asc(projects.name));

  const byWorkspace = new Map<string, AccessibleWorkspace>();
  for (const r of rows) {
    let ws = byWorkspace.get(r.workspaceId);
    if (!ws) {
      ws = { id: r.workspaceId, name: r.workspaceName, projects: [] };
      byWorkspace.set(r.workspaceId, ws);
    }
    if (r.projectId && r.projectName) {
      ws.projects.push({ id: r.projectId, name: r.projectName });
    }
  }
  return Array.from(byWorkspace.values());
};

export const getWorkspaces = async (): Promise<Workspace[]> => {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const results = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      tierName: subscriptionTiers.name,
    })
    .from(workspaces)
    .innerJoin(membersOfWorkspaces, eq(workspaces.id, membersOfWorkspaces.workspaceId))
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(membersOfWorkspaces.userId, session?.user?.id))
    .orderBy(desc(workspaces.createdAt));

  if (results.length === 0) {
    return [];
  }

  let addons: { workspaceId: string; addonSlug: string }[] = [];

  if (isFeatureEnabled(Feature.SUBSCRIPTION)) {
    addons = await db
      .select({ workspaceId: workspaceAddons.workspaceId, addonSlug: workspaceAddons.addonSlug })
      .from(workspaceAddons)
      .where(
        inArray(
          workspaceAddons.workspaceId,
          results.map((r) => r.id)
        )
      );
  }

  const addonsByWorkspace = new Map<string, string[]>();
  for (const addon of addons) {
    const existing = addonsByWorkspace.get(addon.workspaceId) ?? [];
    existing.push(addon.addonSlug);
    addonsByWorkspace.set(addon.workspaceId, existing);
  }

  return results.map((r) => ({
    id: r.id,
    name: r.name,
    tierName: r.tierName as WorkspaceTier,
    addons: addonsByWorkspace.get(r.id) ?? [],
  }));
};
