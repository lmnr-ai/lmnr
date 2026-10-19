import { and, eq } from "drizzle-orm";

import { type OnboardingState } from "@/lib/actions/onboarding/types";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, projects } from "@/lib/db/migrations/schema";

export interface ResumeResolution {
  point: Pick<OnboardingState, "workspaceId" | "projectId" | "step" | "pending"> | null;
  // Cookie owned by this user — suppresses the "already has workspaces" redirect.
  inProgress: boolean;
  // Cookie points at a workspace/project the user can no longer access.
  stale: boolean;
}

export async function resolveResume(saved: OnboardingState | null, userId: string): Promise<ResumeResolution> {
  if (!saved || saved.userId !== userId) {
    return { point: null, inProgress: false, stale: false };
  }
  const owned = await db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(membersOfWorkspaces, eq(projects.workspaceId, membersOfWorkspaces.workspaceId))
    .where(
      and(
        eq(membersOfWorkspaces.userId, userId),
        eq(projects.id, saved.projectId),
        eq(projects.workspaceId, saved.workspaceId)
      )
    )
    .limit(1);
  if (owned.length === 0) {
    return { point: null, inProgress: true, stale: true };
  }
  return {
    point: { workspaceId: saved.workspaceId, projectId: saved.projectId, step: saved.step, pending: saved.pending },
    inProgress: true,
    stale: false,
  };
}
