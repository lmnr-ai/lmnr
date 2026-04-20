import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { alerts, alertTargets, projects, signals } from "@/lib/db/migrations/schema";

import { type AlertMetadata, type AlertTarget, type AlertType, type AlertWithDetails } from "./types";

const TargetSchema = z.object({
  type: z.string(),
  integrationId: z.guid().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  email: z.email().optional(),
});

const SignalEventMetadataSchema = z.object({
  severity: z.number().int().min(0).max(2),
  skipSimilar: z.boolean().optional(),
});

const NewClusterMetadataSchema = z.object({}).strict();

// NEW_CLUSTER alerts ignore metadata; SIGNAL_EVENT alerts require severity + optional skipSimilar.
const buildMetadataValidator = (type: "SIGNAL_EVENT" | "NEW_CLUSTER", metadata: unknown) => {
  if (type === "SIGNAL_EVENT") {
    return SignalEventMetadataSchema.parse(metadata ?? {});
  }
  return NewClusterMetadataSchema.parse(metadata ?? {});
};

const CreateAlertSchema = z.object({
  projectId: z.guid(),
  name: z.string().min(1),
  type: z.enum(["SIGNAL_EVENT", "NEW_CLUSTER"]),
  sourceId: z.guid(),
  targets: z.array(TargetSchema),
  metadata: z.unknown().optional(),
});

const UpdateAlertSchema = z.object({
  alertId: z.guid(),
  projectId: z.guid(),
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

export async function getAlerts(projectId: string, userEmail?: string): Promise<AlertWithDetails[]> {
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
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

  const targetsByAlert = new Map<string, AlertTarget[]>();
  for (const t of targetRows) {
    // Only include the current user's own email target; never expose other members' emails.
    // If userEmail is unknown, strip all email targets as a safeguard.
    if (t.type === "EMAIL" && (!userEmail || t.email !== userEmail)) continue;
    const list = targetsByAlert.get(t.alertId) ?? [];
    list.push({
      id: t.id,
      type: t.type,
      integrationId: t.integrationId,
      channelId: t.channelId,
      channelName: t.channelName,
      email: t.email,
    });
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
  const { projectId, name, type, sourceId, targets, metadata } = CreateAlertSchema.parse(input);
  const validatedMetadata = buildMetadataValidator(type, metadata);

  return await db.transaction(async (tx) => {
    const [alert] = await tx
      .insert(alerts)
      .values({ projectId, name, type, sourceId, metadata: validatedMetadata })
      .returning({ id: alerts.id });

    if (targets.length > 0) {
      await tx.insert(alertTargets).values(
        targets.map((t) => ({
          alertId: alert.id,
          projectId,
          type: t.type,
          integrationId: t.integrationId ?? null,
          channelId: t.channelId ?? null,
          channelName: t.channelName ?? null,
          email: t.email ?? null,
        }))
      );
    }

    return alert;
  });
}

export async function updateAlert(input: z.infer<typeof UpdateAlertSchema>) {
  const { alertId, projectId, name, type, sourceId, targets, userEmail, metadata } = UpdateAlertSchema.parse(input);
  const validatedMetadata = buildMetadataValidator(type, metadata);

  return await db.transaction(async (tx) => {
    await tx
      .update(alerts)
      .set({ name, type, sourceId, metadata: validatedMetadata })
      .where(and(eq(alerts.id, alertId), eq(alerts.projectId, projectId)));

    // Fetch existing email targets belonging to OTHER users so we can preserve them.
    // The frontend only manages the current user's own email target + Slack targets.
    const existingTargets = await tx
      .select({
        id: alertTargets.id,
        type: alertTargets.type,
        integrationId: alertTargets.integrationId,
        channelId: alertTargets.channelId,
        channelName: alertTargets.channelName,
        email: alertTargets.email,
      })
      .from(alertTargets)
      .where(and(eq(alertTargets.alertId, alertId), eq(alertTargets.projectId, projectId)));

    // When userEmail is known, preserve other users' email targets.
    // When userEmail is unknown, preserve ALL email targets as a safeguard.
    const preservedEmailTargets = existingTargets.filter(
      (t) => t.type === "EMAIL" && (!userEmail || t.email !== userEmail)
    );

    await tx.delete(alertTargets).where(and(eq(alertTargets.alertId, alertId), eq(alertTargets.projectId, projectId)));

    const allTargets = [
      ...targets.map((t) => ({
        alertId,
        projectId,
        type: t.type,
        integrationId: t.integrationId ?? null,
        channelId: t.channelId ?? null,
        channelName: t.channelName ?? null,
        email: t.email ?? null,
      })),
      ...preservedEmailTargets.map((t) => ({
        alertId,
        projectId,
        type: t.type,
        integrationId: t.integrationId ?? null,
        channelId: t.channelId ?? null,
        channelName: t.channelName ?? null,
        email: t.email,
      })),
    ];

    if (allTargets.length > 0) {
      await tx.insert(alertTargets).values(allTargets);
    }

    return { id: alertId };
  });
}

export async function deleteAlert(input: z.infer<typeof DeleteAlertSchema>) {
  const { alertId, projectId } = DeleteAlertSchema.parse(input);
  await db.delete(alerts).where(and(eq(alerts.id, alertId), eq(alerts.projectId, projectId)));
  return { success: true };
}
