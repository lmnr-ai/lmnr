import { and, eq, inArray } from "drizzle-orm";

import { REPORT_TARGET_TYPE } from "@/lib/actions/reports/types";
import { db } from "@/lib/db/drizzle";
import { alerts, alertTargets, projects, reports, reportTargets } from "@/lib/db/migrations/schema";

// Subscribes a user's email to every report in the workspace and every alert
// across all of the workspace's projects. Mirrors the auto-subscription a user
// gets on first-workspace onboarding (see createWorkspace + createSignal), so
// members who join via invitation are opted into the same digests and alerts.
// Idempotent: existing EMAIL targets for this address are skipped, so it is
// safe to call on every invitation accept.
export const subscribeMemberToWorkspaceNotifications = async (workspaceId: string, email: string): Promise<void> => {
  await db.transaction(async (tx) => {
    const workspaceReports = await tx
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.workspaceId, workspaceId));

    if (workspaceReports.length > 0) {
      const existingReportTargets = await tx
        .select({ reportId: reportTargets.reportId })
        .from(reportTargets)
        .where(
          and(
            eq(reportTargets.workspaceId, workspaceId),
            eq(reportTargets.type, REPORT_TARGET_TYPE.EMAIL),
            eq(reportTargets.email, email)
          )
        );

      const alreadySubscribedReportIds = new Set(existingReportTargets.map((t) => t.reportId));
      const reportTargetsToInsert = workspaceReports
        .filter((r) => !alreadySubscribedReportIds.has(r.id))
        .map((r) => ({
          workspaceId,
          reportId: r.id,
          type: REPORT_TARGET_TYPE.EMAIL,
          email,
        }));

      if (reportTargetsToInsert.length > 0) {
        await tx.insert(reportTargets).values(reportTargetsToInsert);
      }
    }

    const workspaceProjects = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId));

    if (workspaceProjects.length === 0) {
      return;
    }

    const projectIds = workspaceProjects.map((p) => p.id);

    const workspaceAlerts = await tx
      .select({ id: alerts.id, projectId: alerts.projectId })
      .from(alerts)
      .where(inArray(alerts.projectId, projectIds));

    if (workspaceAlerts.length === 0) {
      return;
    }

    const existingAlertTargets = await tx
      .select({ alertId: alertTargets.alertId })
      .from(alertTargets)
      .where(
        and(inArray(alertTargets.projectId, projectIds), eq(alertTargets.type, "EMAIL"), eq(alertTargets.email, email))
      );

    const alreadySubscribedAlertIds = new Set(existingAlertTargets.map((t) => t.alertId));
    const alertTargetsToInsert = workspaceAlerts
      .filter((a) => !alreadySubscribedAlertIds.has(a.id))
      .map((a) => ({
        alertId: a.id,
        projectId: a.projectId,
        type: "EMAIL" as const,
        email,
      }));

    if (alertTargetsToInsert.length > 0) {
      await tx.insert(alertTargets).values(alertTargetsToInsert);
    }
  });
};
