import { and, eq, inArray, not, notInArray } from "drizzle-orm";
import { z } from "zod/v4";

import { getSlackIntegration } from "@/lib/actions/slack";
import {
  getVisibleSlackChannels,
  mergeSlackChannelSelection,
  redactSlackChannel,
} from "@/lib/actions/slack/visibility";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { projects, reportProjects, reports, reportTargets } from "@/lib/db/migrations/schema";

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

const SetEmailSubscriptionsSchema = z.object({
  workspaceId: z.guid(),
  email: z.email(),
  subscribedReportIds: z.array(z.guid()),
});

const SetSlackTargetsSchema = z.object({
  reportId: z.uuid(),
  workspaceId: z.uuid(),
  userId: z.uuid(),
  // Only ids are used; names come from Slack.
  channels: z.array(z.object({ id: z.string().min(1) })),
});

const SetExcludedProjectsSchema = z.object({
  reportId: z.uuid(),
  workspaceId: z.uuid(),
  excludedProjectIds: z.array(z.uuid()),
});

export async function getReports(
  workspaceId: string,
  userId: string,
  userEmail?: string
): Promise<ReportWithDetails[]> {
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

  const visible = targetRows.some((t) => t.type === REPORT_TARGET_TYPE.SLACK)
    ? await getVisibleSlackChannels(workspaceId, userId)
    : new Map();

  const excludedRows = await db
    .select({ reportId: reportProjects.reportId, projectId: reportProjects.projectId })
    .from(reportProjects)
    .where(
      and(
        inArray(
          reportProjects.reportId,
          reportRows.map((r) => r.id)
        ),
        not(reportProjects.enabled)
      )
    );

  const excludedByReport = new Map<string, string[]>();
  for (const row of excludedRows) {
    excludedByReport.set(row.reportId, [...(excludedByReport.get(row.reportId) ?? []), row.projectId]);
  }

  const targetsByReport = new Map<string, ReportTargetRow[]>();
  for (const t of targetRows) {
    // Only include the current user's own email target; never expose other members' emails.
    // If userEmail is unknown, strip all email targets as a safeguard.
    if (t.type === REPORT_TARGET_TYPE.EMAIL && (!userEmail || t.email !== userEmail)) continue;
    const list = targetsByReport.get(t.reportId) ?? [];
    const target = {
      id: t.id,
      type: t.type,
      email: t.email,
      channelId: t.channelId,
      channelName: t.channelName,
    };
    list.push(t.type === REPORT_TARGET_TYPE.SLACK ? redactSlackChannel(target, visible) : target);
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
      excludedProjectIds: excludedByReport.get(r.id) ?? [],
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

// Overwrites the caller's email subscriptions across all reports in the
// workspace — drops any not in `subscribedReportIds`, inserts the rest.
export async function setEmailSubscriptions(input: z.infer<typeof SetEmailSubscriptionsSchema>) {
  const { workspaceId, email, subscribedReportIds } = SetEmailSubscriptionsSchema.parse(input);

  return await db.transaction(async (tx) => {
    const workspaceReports = await tx
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.workspaceId, workspaceId));
    const validIds = workspaceReports.map((r) => r.id);
    const targetIds = subscribedReportIds.filter((id) => validIds.includes(id));

    await tx
      .delete(reportTargets)
      .where(
        and(
          eq(reportTargets.workspaceId, workspaceId),
          eq(reportTargets.type, REPORT_TARGET_TYPE.EMAIL),
          eq(reportTargets.email, email)
        )
      );

    if (targetIds.length > 0) {
      await tx.insert(reportTargets).values(
        targetIds.map((reportId) => ({
          workspaceId,
          reportId,
          type: REPORT_TARGET_TYPE.EMAIL,
          email,
        }))
      );
    }

    return { success: true, subscribed: targetIds.length };
  });
}

// Replace the report's Slack targets with the provided channel set, as far as the caller can see:
// channels they aren't in are kept, and new ones must be visible to them.
// Pass an empty `channels` array to remove every visible Slack target.
export async function setSlackTargets(input: z.infer<typeof SetSlackTargetsSchema>) {
  const { reportId, workspaceId, userId, channels } = SetSlackTargetsSchema.parse(input);

  const integration = await getSlackIntegration(workspaceId);
  if (!integration) {
    throw new ApiError("Slack isn't connected to this workspace.", 400);
  }
  const stored = await db
    .select({ channelId: reportTargets.channelId, channelName: reportTargets.channelName })
    .from(reportTargets)
    .where(
      and(
        eq(reportTargets.reportId, reportId),
        eq(reportTargets.workspaceId, workspaceId),
        eq(reportTargets.type, REPORT_TARGET_TYPE.SLACK)
      )
    );
  const visible = await getVisibleSlackChannels(workspaceId, userId);
  const { kept, added } = mergeSlackChannelSelection({ stored, requestedIds: channels.map((c) => c.id), visible });
  const rows = [
    ...kept.map((t) => ({
      channelId: t.channelId,
      channelName: visible.get(t.channelId ?? "")?.name ?? t.channelName,
    })),
    ...added.map((c) => ({ channelId: c.id, channelName: c.name })),
  ];

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

    if (rows.length > 0) {
      await tx.insert(reportTargets).values(
        rows.map((r) => ({
          workspaceId,
          reportId,
          type: REPORT_TARGET_TYPE.SLACK,
          integrationId: integration.id,
          ...r,
        }))
      );
    }

    return { success: true };
  });
}

// Replace the set of projects left out of a report. Ids outside the workspace are dropped.
// Rows are flipped rather than deleted so they can carry other per-project report settings.
export async function setExcludedProjects(input: z.infer<typeof SetExcludedProjectsSchema>) {
  const { reportId, workspaceId, excludedProjectIds } = SetExcludedProjectsSchema.parse(input);

  return await db.transaction(async (tx) => {
    const [report] = await tx
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.id, reportId), eq(reports.workspaceId, workspaceId)));

    if (!report) {
      throw new Error("Report not found.");
    }

    const excludedIds =
      excludedProjectIds.length > 0
        ? (
            await tx
              .select({ id: projects.id })
              .from(projects)
              .where(and(eq(projects.workspaceId, workspaceId), inArray(projects.id, excludedProjectIds)))
          ).map((p) => p.id)
        : [];

    await tx
      .update(reportProjects)
      .set({ enabled: true })
      .where(
        and(
          eq(reportProjects.reportId, reportId),
          not(reportProjects.enabled),
          excludedIds.length > 0 ? notInArray(reportProjects.projectId, excludedIds) : undefined
        )
      );

    if (excludedIds.length > 0) {
      await tx
        .insert(reportProjects)
        .values(excludedIds.map((projectId) => ({ reportId, projectId, enabled: false })))
        .onConflictDoUpdate({
          target: [reportProjects.reportId, reportProjects.projectId],
          set: { enabled: false },
        });
    }

    return { success: true, excluded: excludedIds.length };
  });
}
