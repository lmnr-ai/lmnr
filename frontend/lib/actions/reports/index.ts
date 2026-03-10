import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { cronJobs, reports,reportTargets } from "@/lib/db/migrations/schema";

import { REPORT_TYPE_LABELS, type ReportTargetRow, type ReportType, type ReportWithDetails } from "./types";

const OptInSchema = z.object({
  reportId: z.uuid(),
  workspaceId: z.uuid(),
  email: z.email(),
});

const OptOutSchema = z.object({
  reportId: z.uuid(),
  workspaceId: z.uuid(),
  email: z.email(),
});

export async function getReports(workspaceId: string): Promise<ReportWithDetails[]> {
  const reportRows = await db
    .select({
      id: reports.id,
      text: reports.text,
      workspaceId: reports.workspaceId,
      createdAt: reports.createdAt,
      cronJobId: reports.cronJobId,
    })
    .from(reports)
    .where(eq(reports.workspaceId, workspaceId))
    .orderBy(reports.createdAt);

  if (reportRows.length === 0) return [];

  const [cronJobRows, targetRows] = await Promise.all([
    db
      .select({
        id: cronJobs.id,
        weekday: cronJobs.weekday,
        hour: cronJobs.hour,
      })
      .from(cronJobs)
      .where(eq(cronJobs.workspaceId, workspaceId)),
    db
      .select({
        id: reportTargets.id,
        reportId: reportTargets.reportId,
        type: reportTargets.type,
        email: reportTargets.email,
        channelId: reportTargets.channelId,
        channelName: reportTargets.channelName,
      })
      .from(reportTargets)
      .where(eq(reportTargets.workspaceId, workspaceId)),
  ]);

  const cronJobMap = new Map(cronJobRows.map((j) => [j.id, { weekday: j.weekday, hour: j.hour }]));

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
    const reportType = r.text as ReportType;
    return {
      id: r.id,
      reportType,
      label: REPORT_TYPE_LABELS[reportType] ?? r.text,
      workspaceId: r.workspaceId,
      createdAt: r.createdAt,
      schedule: cronJobMap.get(r.cronJobId) ?? { weekday: [], hour: 0 },
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
    type: "email",
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
