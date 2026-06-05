import { desc, eq, inArray } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { z } from "zod/v4";

import { createProject } from "@/lib/actions/projects";
import { REPORT_TARGET_TYPE } from "@/lib/actions/reports/types";
import { authOptions } from "@/lib/auth";
import { defaultReports } from "@/lib/db/default-charts.ts";
import { db } from "@/lib/db/drizzle";
import {
  membersOfWorkspaces,
  reports,
  reportTargets,
  subscriptionTiers,
  workspaceAddons,
  workspaces,
} from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { type Workspace, WorkspaceTier } from "@/lib/workspaces/types";

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
  const { userId, userEmail, name, projectName } = input;

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name,
      tierId: 1,
    })
    .returning({
      id: workspaces.id,
      name: workspaces.name,
    });

  if (!workspace) {
    throw new Error("Failed to create workspace");
  }

  await db.insert(membersOfWorkspaces).values({
    userId,
    workspaceId: workspace.id,
    memberRole: "owner",
  });

  const insertedReports = await db
    .insert(reports)
    .values(
      defaultReports.map((r) => ({
        workspaceId: workspace.id,
        type: r.type,
        weekdays: r.weekdays,
        hour: r.hour,
      }))
    )
    .returning({ id: reports.id });

  if (userEmail && insertedReports.length > 0) {
    await db.insert(reportTargets).values(
      insertedReports.map((r) => ({
        workspaceId: workspace.id,
        reportId: r.id,
        type: REPORT_TARGET_TYPE.EMAIL,
        email: userEmail,
      }))
    );
  }

  let projectId: string | undefined;

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
