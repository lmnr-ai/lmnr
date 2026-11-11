import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { getSlackIntegration } from "@/lib/actions/slack";
import {
  getVisibleSlackChannels,
  mergeSlackChannelSelection,
  redactSlackChannel,
  type VisibleSlackChannels,
} from "@/lib/actions/slack/visibility";
import { ApiError } from "@/lib/api/errors";
import { ALERT_FILTERS_CACHE_KEY, cache } from "@/lib/cache.ts";
import { db } from "@/lib/db/drizzle";
import { alerts, alertTargets, projects, signals } from "@/lib/db/migrations/schema";

import {
  ALERT_TARGET_TYPE,
  type AlertMetadata,
  type AlertTarget,
  type AlertType,
  type AlertWithDetails,
} from "./types";

const TargetSchema = z.object({
  type: z.string(),
  integrationId: z.guid().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  email: z.email().optional(),
});

const SignalEventMetadataSchema = z.object({
  severities: z.array(z.number().int().min(0).max(2)).nonempty(),
  skipSimilar: z.boolean().optional(),
  disabled: z.boolean().optional(),
});

const NewClusterMetadataSchema = z.object({ disabled: z.boolean().optional() }).strict();

// NEW_CLUSTER alerts ignore metadata; SIGNAL_EVENT alerts require severities + optional skipSimilar.
const buildMetadataValidator = (type: "SIGNAL_EVENT" | "NEW_CLUSTER", metadata: unknown) => {
  if (type === "SIGNAL_EVENT") {
    const parsed = SignalEventMetadataSchema.parse(metadata ?? {});
    const dedupedSeverities = Array.from(new Set(parsed.severities)).sort((a, b) => a - b);
    return { ...parsed, severities: dedupedSeverities };
  }
  return NewClusterMetadataSchema.parse(metadata ?? {});
};

const CreateAlertSchema = z.object({
  projectId: z.guid(),
  userId: z.guid(),
  name: z.string().min(1),
  type: z.enum(["SIGNAL_EVENT", "NEW_CLUSTER"]),
  sourceId: z.guid(),
  targets: z.array(TargetSchema),
  metadata: z.unknown().optional(),
});

const UpdateAlertSchema = z.object({
  alertId: z.guid(),
  projectId: z.guid(),
  userId: z.guid(),
  name: z.string().min(1),
  type: z.enum(["SIGNAL_EVENT", "NEW_CLUSTER"]),
  sourceId: z.guid(),
  targets: z.array(TargetSchema),
  userEmail: z.string().optional(),
  metadata: z.unknown().optional(),
});

const DeleteAlertSchema = z.object({
  alertId: z.guid(),
  projectId: z.guid(),
});

const SetAlertDisabledSchema = z.object({
  alertId: z.guid(),
  projectId: z.guid(),
  disabled: z.boolean(),
});

export async function getAlerts(projectId: string, userId: string, userEmail?: string): Promise<AlertWithDetails[]> {
  const [project] = await db
    .select({ id: projects.id, name: projects.name, workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) return [];

  const alertRows = await db
    .select({
      id: alerts.id,
      name: alerts.name,
      type: alerts.type,
      sourceId: alerts.sourceId,
      signalName: signals.name,
      projectId: alerts.projectId,
      createdAt: alerts.createdAt,
      metadata: alerts.metadata,
    })
    .from(alerts)
    .leftJoin(signals, eq(alerts.sourceId, signals.id))
    .where(eq(alerts.projectId, projectId))
    .orderBy(alerts.createdAt);

  if (alertRows.length === 0) return [];

  const alertIds = alertRows.map((a) => a.id);

  const targetRows = await db
    .select({
      id: alertTargets.id,
      alertId: alertTargets.alertId,
      type: alertTargets.type,
      integrationId: alertTargets.integrationId,
      channelId: alertTargets.channelId,
      channelName: alertTargets.channelName,
      email: alertTargets.email,
    })
    .from(alertTargets)
    .where(inArray(alertTargets.alertId, alertIds));

  const visible = targetRows.some((t) => t.type === ALERT_TARGET_TYPE.SLACK)
    ? await getVisibleSlackChannels(project.workspaceId, userId)
    : new Map();

  const targetsByAlert = new Map<string, AlertTarget[]>();
  for (const t of targetRows) {
    // Only include the current user's own email target; never expose other members' emails.
    // If userEmail is unknown, strip all email targets as a safeguard.
    if (t.type === "EMAIL" && (!userEmail || t.email !== userEmail)) continue;
    const list = targetsByAlert.get(t.alertId) ?? [];
    const target = {
      id: t.id,
      type: t.type,
      integrationId: t.integrationId,
      channelId: t.channelId,
      channelName: t.channelName,
      email: t.email,
    };
    list.push(t.type === ALERT_TARGET_TYPE.SLACK ? redactSlackChannel(target, visible) : target);
    targetsByAlert.set(t.alertId, list);
  }

  return alertRows.map((a) => ({
    ...a,
    type: a.type as AlertType,
    signalName: a.signalName,
    projectName: project.name,
    targets: targetsByAlert.get(a.id) ?? [],
    metadata: (a.metadata as AlertMetadata) ?? {},
  }));
}

export async function createAlert(input: z.infer<typeof CreateAlertSchema>) {
  const { projectId, userId, name, type, sourceId, targets, metadata } = CreateAlertSchema.parse(input);
  const validatedMetadata = buildMetadataValidator(type, metadata);
  const slack = await resolveSlackSelection({ projectId, userId, stored: [], targets });

  return await db.transaction(async (tx) => {
    const [alert] = await tx
      .insert(alerts)
      .values({ projectId, name, type, sourceId, metadata: validatedMetadata })
      .returning({ id: alerts.id });

    const rows = [
      ...slackTargetRows(slack),
      ...targets
        .filter((t) => t.type !== ALERT_TARGET_TYPE.SLACK)
        .map((t) => ({
          type: t.type,
          integrationId: null,
          channelId: null,
          channelName: null,
          email: t.email ?? null,
        })),
    ];
    if (rows.length > 0) {
      await tx.insert(alertTargets).values(rows.map((r) => ({ ...r, alertId: alert.id, projectId })));
    }

    return alert;
  });
}

interface StoredSlackTarget {
  integrationId: string | null;
  channelId: string | null;
  channelName: string | null;
}

/**
 * The Slack targets to store for a requested channel selection, per `mergeSlackChannelSelection`:
 * names come from Slack, never the client, and channels the caller can't see stay untouched.
 */
async function resolveSlackSelection(input: {
  projectId: string;
  userId: string;
  stored: StoredSlackTarget[];
  targets: z.infer<typeof TargetSchema>[];
}): Promise<{ kept: StoredSlackTarget[]; added: StoredSlackTarget[]; visible: VisibleSlackChannels }> {
  const requestedIds = input.targets.flatMap((t) =>
    t.type === ALERT_TARGET_TYPE.SLACK && t.channelId ? [t.channelId] : []
  );
  if (requestedIds.length === 0 && input.stored.length === 0) {
    return { kept: [], added: [], visible: new Map() };
  }

  const [project] = await db
    .select({ workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);
  if (!project) throw new ApiError("Project not found.", 404);

  const visible = await getVisibleSlackChannels(project.workspaceId, input.userId);
  const { kept, added } = mergeSlackChannelSelection({ stored: input.stored, requestedIds, visible });
  const integration = added.length > 0 ? await getSlackIntegration(project.workspaceId) : null;

  return {
    kept,
    added: added.map((c) => ({ integrationId: integration?.id ?? null, channelId: c.id, channelName: c.name })),
    visible,
  };
}

function slackTargetRows(slack: Awaited<ReturnType<typeof resolveSlackSelection>>) {
  return [...slack.kept, ...slack.added].map((t) => ({
    type: ALERT_TARGET_TYPE.SLACK as string,
    integrationId: t.integrationId,
    channelId: t.channelId,
    // Refresh the cached name of channels the caller can see; keep the stored one otherwise.
    channelName: (t.channelId && slack.visible.get(t.channelId)?.name) ?? t.channelName,
    email: null,
  }));
}

async function updateAlert(input: z.infer<typeof UpdateAlertSchema>) {
  const { alertId, projectId, userId, name, type, sourceId, targets, userEmail, metadata } =
    UpdateAlertSchema.parse(input);
  const validatedMetadata = buildMetadataValidator(type, metadata);

  // Slack lookups are network calls, so they run before the transaction.
  const storedSlack = await db
    .select({
      integrationId: alertTargets.integrationId,
      channelId: alertTargets.channelId,
      channelName: alertTargets.channelName,
    })
    .from(alertTargets)
    .where(
      and(
        eq(alertTargets.alertId, alertId),
        eq(alertTargets.projectId, projectId),
        eq(alertTargets.type, ALERT_TARGET_TYPE.SLACK)
      )
    );
  const slack = await resolveSlackSelection({ projectId, userId, stored: storedSlack, targets });

  const result = await db.transaction(async (tx) => {
    await tx
      .update(alerts)
      .set({ name, type, sourceId, metadata: validatedMetadata })
      .where(and(eq(alerts.id, alertId), eq(alerts.projectId, projectId)));

    // The frontend only manages the current user's own email target, so other users' email
    // targets are preserved. When userEmail is unknown, ALL email targets are preserved.
    const existingEmailTargets = await tx
      .select({ email: alertTargets.email })
      .from(alertTargets)
      .where(
        and(
          eq(alertTargets.alertId, alertId),
          eq(alertTargets.projectId, projectId),
          eq(alertTargets.type, ALERT_TARGET_TYPE.EMAIL)
        )
      );
    const preservedEmails = existingEmailTargets.filter((t) => !userEmail || t.email !== userEmail);

    await tx.delete(alertTargets).where(and(eq(alertTargets.alertId, alertId), eq(alertTargets.projectId, projectId)));

    const allTargets = [
      ...slackTargetRows(slack),
      ...targets
        .filter((t) => t.type === ALERT_TARGET_TYPE.EMAIL)
        .map((t) => ({
          type: t.type,
          integrationId: null,
          channelId: null,
          channelName: null,
          email: t.email ?? null,
        })),
      ...preservedEmails.map((t) => ({
        type: ALERT_TARGET_TYPE.EMAIL as string,
        integrationId: null,
        channelId: null,
        channelName: null,
        email: t.email,
      })),
    ].map((t) => ({ ...t, alertId, projectId }));

    if (allTargets.length > 0) {
      await tx.insert(alertTargets).values(allTargets);
    }

    return { id: alertId };
  });

  await cache.remove(`${ALERT_FILTERS_CACHE_KEY}:${projectId}:${alertId}`);

  return result;
}

async function setAlertDisabled(input: z.infer<typeof SetAlertDisabledSchema>) {
  const { alertId, projectId, disabled } = SetAlertDisabledSchema.parse(input);

  const [existing] = await db
    .select({ metadata: alerts.metadata })
    .from(alerts)
    .where(and(eq(alerts.id, alertId), eq(alerts.projectId, projectId)))
    .limit(1);

  if (!existing) throw new Error("Alert not found.");

  const nextMetadata: AlertMetadata = { ...((existing.metadata as AlertMetadata) ?? {}) };
  if (disabled) {
    nextMetadata.disabled = true;
  } else {
    delete nextMetadata.disabled;
  }

  await db
    .update(alerts)
    .set({ metadata: nextMetadata })
    .where(and(eq(alerts.id, alertId), eq(alerts.projectId, projectId)));

  await cache.remove(`${ALERT_FILTERS_CACHE_KEY}:${projectId}:${alertId}`);

  return { id: alertId, disabled };
}

export class AlertEmailTargetError extends ApiError {
  constructor() {
    super("Cannot set alert email targets for other users.", 403);
    this.name = "AlertEmailTargetError";
  }
}

// Single dispatch point for PATCH /alerts/:id, keyed on `body.action` (defaults to "update").
export async function patchAlert(input: {
  projectId: string;
  alertId: string;
  userId: string;
  userEmail?: string;
  body: Record<string, any>;
}) {
  const { projectId, alertId, userId, userEmail, body } = input;

  switch (body?.action ?? "update") {
    case "toggleDisabled":
      return setAlertDisabled({ alertId, projectId, disabled: body.disabled });
    case "update": {
      const emailTargets = (body.targets ?? []).filter((t: { type: string; email?: string }) => t.type === "EMAIL");
      if (userEmail && emailTargets.some((t: { email?: string }) => t.email && t.email !== userEmail)) {
        throw new AlertEmailTargetError();
      }
      // updateAlert re-validates via zod; body is untyped JSON so cast to its input shape.
      return updateAlert({ ...body, projectId, alertId, userId, userEmail } as Parameters<typeof updateAlert>[0]);
    }
    default:
      throw new Error(`Unknown alert action: ${body?.action}`);
  }
}

export async function deleteAlert(input: z.infer<typeof DeleteAlertSchema>) {
  const { alertId, projectId } = DeleteAlertSchema.parse(input);
  await db.delete(alerts).where(and(eq(alerts.id, alertId), eq(alerts.projectId, projectId)));

  await cache.remove(`${ALERT_FILTERS_CACHE_KEY}:${projectId}:${alertId}`);

  return { success: true };
}
