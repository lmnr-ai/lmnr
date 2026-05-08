import { eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import {
  reports as reportsTable,
  reportTargets,
  signals,
  slackIntegrations,
  subscriptionTiers,
  workspaces,
} from "@/lib/db/migrations/schema";

export type OnboardingTier = "free" | "hobby" | "pro";

export interface OnboardingHydratedValues {
  selectedSignalIds: string[];
  emailNotificationsEnabled: boolean;
  slackConnected: boolean;
  selectedTier: OnboardingTier;
}

const TIER_NAME_TO_FORM_VALUE: Record<string, OnboardingTier> = {
  free: "free",
  hobby: "hobby",
  pro: "pro",
};

interface HydrateInput {
  workspaceId: string;
  projectId: string;
  userEmail: string | null;
}

// Pulls the current state of every step's resources from the DB so that a user
// resuming onboarding sees their existing selections (signals already created,
// email subscription state, Slack connection, current tier) pre-filled. Save
// handlers then become reconcile operations against this baseline.
export async function hydrateOnboardingValues({
  workspaceId,
  projectId,
  userEmail,
}: HydrateInput): Promise<OnboardingHydratedValues> {
  const [signalRows, emailTargetRows, slackRows, tierRows] = await Promise.all([
    db.select({ name: signals.name }).from(signals).where(eq(signals.projectId, projectId)),
    userEmail
      ? db
          .select({ id: reportTargets.id })
          .from(reportTargets)
          .innerJoin(reportsTable, eq(reportTargets.reportId, reportsTable.id))
          .where(eq(reportsTable.workspaceId, workspaceId))
          .limit(1)
      : Promise.resolve([] as { id: string }[]),
    db
      .select({ id: slackIntegrations.id })
      .from(slackIntegrations)
      .where(eq(slackIntegrations.workspaceId, workspaceId))
      .limit(1),
    db
      .select({ name: subscriptionTiers.name })
      .from(workspaces)
      .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
  ]);

  const tierName = (tierRows[0]?.name ?? "Free").toLowerCase();
  const selectedTier = TIER_NAME_TO_FORM_VALUE[tierName] ?? "free";

  return {
    selectedSignalIds: signalRows.map((r) => r.name),
    // We didn't filter targets by user email server-side; if any email target
    // exists for the workspace's reports, treat the user as opted in. The
    // notifications step's reconcile only deletes targets matching userEmail
    // on opt-out, so a stray foreign-email target won't be touched.
    emailNotificationsEnabled: emailTargetRows.length > 0,
    slackConnected: slackRows.length > 0,
    selectedTier,
  };
}
