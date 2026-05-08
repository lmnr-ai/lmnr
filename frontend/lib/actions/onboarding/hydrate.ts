import { and, eq } from "drizzle-orm";

import { REPORT_TARGET_TYPE } from "@/lib/actions/reports/types";
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
          .where(
            and(
              eq(reportsTable.workspaceId, workspaceId),
              eq(reportTargets.type, REPORT_TARGET_TYPE.EMAIL),
              eq(reportTargets.email, userEmail)
            )
          )
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
    // Only the current user's EMAIL targets count — Slack targets and other
    // users' email subscriptions must not flip this user's opt-in flag.
    emailNotificationsEnabled: emailTargetRows.length > 0,
    slackConnected: slackRows.length > 0,
    selectedTier,
  };
}
