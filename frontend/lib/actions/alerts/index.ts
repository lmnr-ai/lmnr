import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { alerts, alertTargets, projects } from "@/lib/db/migrations/schema";

import { type AlertTarget, type AlertType, type AlertWithDetails } from "./types";

const CreateAlertSchema = z.object({
  projectId: z.uuid(),
  name: z.string().min(1),
  type: z.enum(["SIGNAL_EVENT"]),
  sourceId: z.uuid(),
  targets: z
    .array(
      z.object({
        type: z.string(),
        integrationId: z.uuid(),
        channelId: z.string().optional(),
        channelName: z.string().optional(),
      })
    )
    .min(1),
});

const UpdateAlertSchema = z.object({
  alertId: z.uuid(),
  projectId: z.uuid(),
  name: z.string().min(1),
  type: z.enum(["SIGNAL_EVENT"]),
  sourceId: z.uuid(),
  targets: z
    .array(
      z.object({
        type: z.string(),
        integrationId: z.uuid(),
        channelId: z.string().optional(),
        channelName: z.string().optional(),
      })
    )
    .min(1),
});

const DeleteAlertSchema = z.object({
  alertId: z.uuid(),
  projectId: z.uuid(),
});

export async function getAlerts(projectId: string): Promise<AlertWithDetails[]> {
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
      projectId: alerts.projectId,
      createdAt: alerts.createdAt,
    })
    .from(alerts)
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
    projectName: project.name,
    targets: targetsByAlert.get(a.id) ?? [],
  }));
}

export async function createAlert(input: z.infer<typeof CreateAlertSchema>) {
  const { projectId, name, type, sourceId, targets } = CreateAlertSchema.parse(input);

  return await db.transaction(async (tx) => {
    const [alert] = await tx.insert(alerts).values({ projectId, name, type, sourceId }).returning({ id: alerts.id });

    await tx.insert(alertTargets).values(
      targets.map((t) => ({
        alertId: alert.id,
        projectId,
        type: t.type,
        integrationId: t.integrationId,
        channelId: t.channelId ?? null,
        channelName: t.channelName ?? null,
      }))
    );

    return alert;
  });
}

export async function updateAlert(input: z.infer<typeof UpdateAlertSchema>) {
  const { alertId, projectId, name, type, sourceId, targets } = UpdateAlertSchema.parse(input);

  return await db.transaction(async (tx) => {
    await tx.update(alerts).set({ name, type, sourceId }).where(eq(alerts.id, alertId));

    await tx.delete(alertTargets).where(eq(alertTargets.alertId, alertId));

    await tx.insert(alertTargets).values(
      targets.map((t) => ({
        alertId,
        projectId,
        type: t.type,
        integrationId: t.integrationId,
        channelId: t.channelId ?? null,
        channelName: t.channelName ?? null,
      }))
    );

    return { id: alertId };
  });
}

export async function deleteAlert(input: z.infer<typeof DeleteAlertSchema>) {
  const { alertId, projectId } = DeleteAlertSchema.parse(input);
  await db.delete(alerts).where(and(eq(alerts.id, alertId), eq(alerts.projectId, projectId)));
  return { success: true };
}
