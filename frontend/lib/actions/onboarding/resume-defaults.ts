import { and, eq } from "drizzle-orm";

import { REPORT_TARGET_TYPE } from "@/lib/actions/reports/types";
import { db } from "@/lib/db/drizzle";
import { reportTargets, signals, slackIntegrations, subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";

export type OnboardingTier = "free" | "hobby" | "pro";

export interface OnboardingResumeDefaults {
  workspaceName: string | null;
  selectedTemplateNames: string[];
  subscribedReportIds: string[];
  slackConnected: boolean;
  selectedTier: OnboardingTier;
}

interface Input {
  workspaceId: string;
  projectId: string;
  userEmail: string | null;
}

const TIERS: ReadonlySet<OnboardingTier> = new Set(["free", "hobby", "pro"]);

const asTier = (raw: string | null | undefined): OnboardingTier => {
  const candidate = (raw ?? "free").toLowerCase() as OnboardingTier;
  return TIERS.has(candidate) ? candidate : "free";
};

// workspaceName ships into Stripe as subscription metadata via the plan step,
// so it must come from the DB on resume.
async function loadWorkspaceContext(workspaceId: string) {
  const [row] = await db
    .select({ tierName: subscriptionTiers.name, workspaceName: workspaces.name })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return {
    workspaceName: row?.workspaceName ?? null,
    selectedTier: asTier(row?.tierName),
  };
}

async function loadSelectedTemplateNames(projectId: string): Promise<string[]> {
  const rows = await db.select({ name: signals.name }).from(signals).where(eq(signals.projectId, projectId));
  return rows.map((r) => r.name);
}

async function loadSlackConnected(workspaceId: string): Promise<boolean> {
  const rows = await db
    .select({ id: slackIntegrations.id })
    .from(slackIntegrations)
    .where(eq(slackIntegrations.workspaceId, workspaceId))
    .limit(1);
  return rows.length > 0;
}

async function loadSubscribedReportIds(workspaceId: string, userEmail: string | null): Promise<string[]> {
  if (!userEmail) return [];
  const rows = await db
    .select({ reportId: reportTargets.reportId })
    .from(reportTargets)
    .where(
      and(
        eq(reportTargets.workspaceId, workspaceId),
        eq(reportTargets.type, REPORT_TARGET_TYPE.EMAIL),
        eq(reportTargets.email, userEmail)
      )
    );
  return rows.map((r) => r.reportId);
}

export async function loadOnboardingResumeDefaults({
  workspaceId,
  projectId,
  userEmail,
}: Input): Promise<OnboardingResumeDefaults> {
  const [workspaceCtx, selectedTemplateNames, slackConnected, subscribedReportIds] = await Promise.all([
    loadWorkspaceContext(workspaceId),
    loadSelectedTemplateNames(projectId),
    loadSlackConnected(workspaceId),
    loadSubscribedReportIds(workspaceId, userEmail),
  ]);

  return {
    ...workspaceCtx,
    selectedTemplateNames,
    slackConnected,
    subscribedReportIds,
  };
}
