import { and, eq } from "drizzle-orm";

import { ONBOARDING_STEPS } from "@/components/onboarding/types";
import { type OnboardingState } from "@/lib/actions/onboarding/types";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, projects } from "@/lib/db/migrations/schema";

export interface ResumeResolution {
  point: { workspaceId: string; projectId: string; step: number } | null;
  // Cookie owned by this user — suppresses the "already has workspaces" redirect.
  inProgress: boolean;
  // Cookie points at a workspace/project the user can no longer access.
  stale: boolean;
}

export async function resolveResume(saved: OnboardingState | null, userId: string): Promise<ResumeResolution> {
  if (!saved || saved.userId !== userId) {
    return { point: null, inProgress: false, stale: false };
  }
  if (!saved.workspaceId || !saved.projectId) {
    return { point: null, inProgress: true, stale: false };
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
  // Clamp against current step count — old cookies from longer wizards stay valid.
  const step = Math.min(Math.max(0, saved.step), ONBOARDING_STEPS.length - 1);
  return {
    point: { workspaceId: saved.workspaceId, projectId: saved.projectId, step },
    inProgress: true,
    stale: false,
  };
}
