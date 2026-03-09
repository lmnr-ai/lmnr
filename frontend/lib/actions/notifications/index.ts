import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import {
  notifications,
  notificationTriggers,
  slackChannelToEvents,
  slackIntegrations,
} from "@/lib/db/migrations/schema";

const CreateNotificationSchema = z.object({
  projectId: z.uuid(),
  name: z.string().min(1),
  triggerType: z.string().default("signal"),
  triggerConfig: z.record(z.string(), z.unknown()).default({}),
  actions: z
    .array(
      z.object({
        channelId: z.string(),
        channelName: z.string(),
        integrationId: z.uuid(),
      })
    )
    .min(1),
});

const DeleteNotificationSchema = z.object({
  notificationId: z.uuid(),
});

export interface NotificationAction {
  id: string;
  channelId: string;
  channelName: string;
  integrationId: string;
}

export interface NotificationTrigger {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export interface NotificationWithDetails {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
  triggers: NotificationTrigger[];
  actions: NotificationAction[];
}

export async function getNotifications(projectId: string): Promise<NotificationWithDetails[]> {
  const notificationRows = await db
    .select({
      id: notifications.id,
      name: notifications.name,
      projectId: notifications.projectId,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.projectId, projectId))
    .orderBy(notifications.createdAt);

  if (notificationRows.length === 0) return [];

  const notificationIds = notificationRows.map((n) => n.id);

  const [triggers, actions] = await Promise.all([
    db
      .select({
        id: notificationTriggers.id,
        notificationId: notificationTriggers.notificationId,
        type: notificationTriggers.type,
        config: notificationTriggers.config,
      })
      .from(notificationTriggers)
      .where(eq(notificationTriggers.projectId, projectId)),
    db
      .select({
        id: slackChannelToEvents.id,
        notificationId: slackChannelToEvents.notificationId,
        channelId: slackChannelToEvents.channelId,
        channelName: slackChannelToEvents.channelName,
        integrationId: slackChannelToEvents.integrationId,
      })
      .from(slackChannelToEvents)
      .where(eq(slackChannelToEvents.projectId, projectId)),
  ]);

  const triggersByNotification = new Map<string, NotificationTrigger[]>();
  for (const t of triggers) {
    const list = triggersByNotification.get(t.notificationId) ?? [];
    list.push({ id: t.id, type: t.type, config: t.config as Record<string, unknown> });
    triggersByNotification.set(t.notificationId, list);
  }

  const actionsByNotification = new Map<string, NotificationAction[]>();
  for (const a of actions) {
    const list = actionsByNotification.get(a.notificationId) ?? [];
    list.push({ id: a.id, channelId: a.channelId, channelName: a.channelName, integrationId: a.integrationId });
    actionsByNotification.set(a.notificationId, list);
  }

  return notificationRows
    .filter((n) => notificationIds.includes(n.id))
    .map((n) => ({
      ...n,
      triggers: triggersByNotification.get(n.id) ?? [],
      actions: actionsByNotification.get(n.id) ?? [],
    }));
}

export async function createNotification(input: z.infer<typeof CreateNotificationSchema>) {
  const { projectId, name, triggerType, triggerConfig, actions } = CreateNotificationSchema.parse(input);

  return await db.transaction(async (tx) => {
    const [notification] = await tx
      .insert(notifications)
      .values({ projectId, name })
      .returning({ id: notifications.id });

    await tx.insert(notificationTriggers).values({
      notificationId: notification.id,
      type: triggerType,
      config: triggerConfig,
      projectId,
    });

    if (actions.length > 0) {
      await tx.insert(slackChannelToEvents).values(
        actions.map((a) => ({
          notificationId: notification.id,
          channelId: a.channelId,
          channelName: a.channelName,
          integrationId: a.integrationId,
          projectId,
        }))
      );
    }

    return notification;
  });
}

export async function deleteNotification(input: z.infer<typeof DeleteNotificationSchema>) {
  const { notificationId } = DeleteNotificationSchema.parse(input);
  await db.delete(notifications).where(eq(notifications.id, notificationId));
  return { success: true };
}

export async function getSlackIntegrationForWorkspace(workspaceId: string) {
  const [result] = await db
    .select({
      id: slackIntegrations.id,
      teamName: slackIntegrations.teamName,
    })
    .from(slackIntegrations)
    .where(eq(slackIntegrations.workspaceId, workspaceId))
    .limit(1);

  return result ?? null;
}
