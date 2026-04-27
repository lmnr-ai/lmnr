import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { reports, reportTargets } from "@/lib/db/migrations/schema";

import {
  getReportLabel,
  REPORT_TARGET_TYPE,
  type ReportTargetRow,
  type ReportType,
  type ReportWithDetails,
} from "./types";

const OptInSchema = z.object({
  reportId: z.guid(),
  workspaceId: z.guid(),
  email: z.email(),
});

const OptOutSchema = z.object({
  reportId: z.guid(),
  workspaceId: z.guid(),
  email: z.email(),
});

const SetSlackTargetsSchema = z.object({
  reportId: z.uuid(),
  workspaceId: z.uuid(),
  integrationId: z.uuid(),
  channels: z.array(z.object({ id: z.string().min(1), name: z.string() })),
});

export async function getReports(workspaceId: string, userEmail?: string): Promise<ReportWithDetails[]> {
  const reportRows = await db
    .select({
      id: reports.id,
      type: reports.type,
      workspaceId: reports.workspaceId,
      createdAt: reports.createdAt,
      weekdays: reports.weekdays,
      hour: reports.hour,
    })
    .from(reports)
    .where(eq(reports.workspaceId, workspaceId))
    .orderBy(reports.createdAt);

  if (reportRows.length === 0) return [];

  const targetRows = await db
    .select({
      id: reportTargets.id,
      reportId: reportTargets.reportId,
      type: reportTargets.type,
      email: reportTargets.email,
      channelId: reportTargets.channelId,
      channelName: reportTargets.channelName,
    })
    .from(reportTargets)
    .where(eq(reportTargets.workspaceId, workspaceId));

  const targetsByReport = new Map<string, ReportTargetRow[]>();
  for (const t of targetRows) {
    // Only include the current user's own email target; never expose other members' emails.
    // If userEmail is unknown, strip all email targets as a safeguard.
    if (t.type === REPORT_TARGET_TYPE.EMAIL && (!userEmail || t.email !== userEmail)) continue;
    const list = targetsByReport.get(t.reportId) ?? [];
    list.push({
      id: t.id,
      type: t.type,
      email: t.email,
      channelId: t.channelId,
      channelName: t.channelName,
    });
    targetsByReport.set(t.reportId, list);
  }

  return reportRows.map((r) => {
    const reportType = r.type as ReportType;
    return {
      id: r.id,
      reportType,
      label: getReportLabel({ weekdays: r.weekdays, hour: r.hour }),
      workspaceId: r.workspaceId,
      createdAt: r.createdAt,
      schedule: { weekdays: r.weekdays, hour: r.hour },
      targets: targetsByReport.get(r.id) ?? [],
    };
  });
}

export async function optInReport(input: z.infer<typeof OptInSchema>) {
  const { reportId, workspaceId, email } = OptInSchema.parse(input);

  const existing = await db
    .select({ id: reportTargets.id })
    .from(reportTargets)
    .where(
      and(
        eq(reportTargets.reportId, reportId),
        eq(reportTargets.workspaceId, workspaceId),
        eq(reportTargets.email, email)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return { success: true, alreadySubscribed: true };
  }

  await db.insert(reportTargets).values({
    workspaceId,
    reportId,
    type: REPORT_TARGET_TYPE.EMAIL,
    email,
  });

  return { success: true };
}

export async function optOutReport(input: z.infer<typeof OptOutSchema>) {
  const { reportId, workspaceId, email } = OptOutSchema.parse(input);

  await db
    .delete(reportTargets)
    .where(
      and(
        eq(reportTargets.reportId, reportId),
        eq(reportTargets.workspaceId, workspaceId),
        eq(reportTargets.email, email)
      )
    );

  return { success: true };
}

// Replace ALL Slack targets for a report with the provided channel set.
// Pass an empty `channels` array to remove every Slack target.
export async function setSlackTargets(input: z.infer<typeof SetSlackTargetsSchema>) {
  const { reportId, workspaceId, integrationId, channels } = SetSlackTargetsSchema.parse(input);

  return await db.transaction(async (tx) => {
    await tx
      .delete(reportTargets)
      .where(
        and(
          eq(reportTargets.reportId, reportId),
          eq(reportTargets.workspaceId, workspaceId),
          eq(reportTargets.type, REPORT_TARGET_TYPE.SLACK)
        )
      );

    if (channels.length > 0) {
      await tx.insert(reportTargets).values(
        channels.map((c) => ({
          workspaceId,
          reportId,
          type: REPORT_TARGET_TYPE.SLACK,
          integrationId,
          channelId: c.id,
          channelName: c.name,
        }))
      );
    }

    return { success: true };
  });
}
