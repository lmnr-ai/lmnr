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

const EmailOptInSchema = z.object({
  reportId: z.uuid(),
  workspaceId: z.uuid(),
  email: z.email(),
  targetType: z.literal(REPORT_TARGET_TYPE.EMAIL),
});

const SlackOptInSchema = z.object({
  reportId: z.uuid(),
  workspaceId: z.uuid(),
  targetType: z.literal(REPORT_TARGET_TYPE.SLACK),
  integrationId: z.uuid(),
  channelId: z.string().min(1),
  channelName: z.string(),
});

const OptInSchema = z.discriminatedUnion("targetType", [EmailOptInSchema, SlackOptInSchema]);

const EmailOptOutSchema = z.object({
  reportId: z.uuid(),
  workspaceId: z.uuid(),
  targetType: z.literal(REPORT_TARGET_TYPE.EMAIL),
  email: z.email(),
});

const SlackOptOutSchema = z.object({
  reportId: z.uuid(),
  workspaceId: z.uuid(),
  targetType: z.literal(REPORT_TARGET_TYPE.SLACK),
  channelId: z.string().min(1),
});

const OptOutSchema = z.discriminatedUnion("targetType", [EmailOptOutSchema, SlackOptOutSchema]);

export async function getReports(workspaceId: string): Promise<ReportWithDetails[]> {
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
  const parsed = OptInSchema.parse(input);

  if (parsed.targetType === REPORT_TARGET_TYPE.EMAIL) {
    const { reportId, workspaceId, email } = parsed;

    const existing = await db
      .select({ id: reportTargets.id })
      .from(reportTargets)
      .where(
        and(
          eq(reportTargets.reportId, reportId),
          eq(reportTargets.workspaceId, workspaceId),
          eq(reportTargets.type, REPORT_TARGET_TYPE.EMAIL),
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
  } else {
    const { reportId, workspaceId, integrationId, channelId, channelName } = parsed;

    // Remove existing Slack targets for this report (only one Slack channel per report)
    await db
      .delete(reportTargets)
      .where(
        and(
          eq(reportTargets.reportId, reportId),
          eq(reportTargets.workspaceId, workspaceId),
          eq(reportTargets.type, REPORT_TARGET_TYPE.SLACK)
        )
      );

    await db.insert(reportTargets).values({
      workspaceId,
      reportId,
      type: REPORT_TARGET_TYPE.SLACK,
      integrationId,
      channelId,
      channelName,
    });
  }

  return { success: true };
}

export async function optOutReport(input: z.infer<typeof OptOutSchema>) {
  const parsed = OptOutSchema.parse(input);

  if (parsed.targetType === REPORT_TARGET_TYPE.EMAIL) {
    const { reportId, workspaceId, email } = parsed;

    await db
      .delete(reportTargets)
      .where(
        and(
          eq(reportTargets.reportId, reportId),
          eq(reportTargets.workspaceId, workspaceId),
          eq(reportTargets.type, REPORT_TARGET_TYPE.EMAIL),
          eq(reportTargets.email, email)
        )
      );
  } else {
    const { reportId, workspaceId, channelId } = parsed;

    await db
      .delete(reportTargets)
      .where(
        and(
          eq(reportTargets.reportId, reportId),
          eq(reportTargets.workspaceId, workspaceId),
          eq(reportTargets.type, REPORT_TARGET_TYPE.SLACK),
          eq(reportTargets.channelId, channelId)
        )
      );
  }

  return { success: true };
}
