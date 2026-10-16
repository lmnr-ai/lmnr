import { eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { projects, subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export const FREE_PLAN_SIGNALS_ERROR =
  "Signals aren't included in the Free plan. Upgrade to Starter or Pro to use Signals.";
export const FREE_PLAN_SLACK_ERROR =
  "Slack alerts aren't included in the Free plan. Upgrade to Starter or Pro to get Slack alerts.";

// Raw name compare, not normalizeTier: self-hosted tiers like "unlimited" must not count as Free.
const isFreeTierName = (name: string | undefined) => name?.trim().toLowerCase() === "free";

// Signals, and with them clustering and Slack alerts, need a paid plan or trial.
// Existing signals on a Free workspace stay visible but never run.
export const assertProjectHasSignals = async (projectId: string): Promise<void> => {
  if (!isFeatureEnabled(Feature.SUBSCRIPTION)) return;
  const [row] = await db
    .select({ tierName: subscriptionTiers.name })
    .from(projects)
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .innerJoin(subscriptionTiers, eq(subscriptionTiers.id, workspaces.tierId))
    .where(eq(projects.id, projectId))
    .limit(1);
  if (isFreeTierName(row?.tierName)) throw new Error(FREE_PLAN_SIGNALS_ERROR);
};

export const assertWorkspaceHasSlack = async (workspaceId: string): Promise<void> => {
  if (!isFeatureEnabled(Feature.SUBSCRIPTION)) return;
  const [row] = await db
    .select({ tierName: subscriptionTiers.name })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(subscriptionTiers.id, workspaces.tierId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (isFreeTierName(row?.tierName)) throw new Error(FREE_PLAN_SLACK_ERROR);
};
