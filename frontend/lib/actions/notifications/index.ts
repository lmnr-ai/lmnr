import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { notificationReads } from "@/lib/db/migrations/schema";

export interface WebNotification {
  id: string;
  projectId: string;
  workspaceId: string;
  definitionType: string;
  definitionId: string;
  payload: string;
  createdAt: string;
  isRead: boolean;
}

const GetWebNotificationsSchema = z.object({
  projectId: z.guid(),
  userId: z.guid(),
  limit: z.number().int().positive().optional().default(100),
});

const MarkNotificationsAsReadSchema = z.object({
  userId: z.guid(),
  notificationIds: z.array(z.guid()).min(1),
  projectId: z.guid(),
});

export const getWebNotifications = async (
  input: z.input<typeof GetWebNotificationsSchema>
): Promise<WebNotification[]> => {
  const { projectId, userId, limit } = GetWebNotificationsSchema.parse(input);

  const result = await clickhouseClient.query({
    query: `
      SELECT
        notification_id as id,
        project_id as projectId,
        workspace_id as workspaceId,
        definition_type as definitionType,
        definition_id as definitionId,
        payload,
        formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') as createdAt
      FROM notifications
      WHERE project_id = {projectId: UUID}
        AND created_at >= now() - INTERVAL 1 MONTH
      ORDER BY created_at DESC
      LIMIT {limit: UInt32}
    `,
    query_params: { projectId, limit },
    format: "JSONEachRow",
  });

  const notifications = (await result.json()) as Omit<WebNotification, "isRead">[];

  if (notifications.length === 0) {
    return [];
  }

  const notificationIds = notifications.map((n) => n.id);
  const readRows = await db
    .select({ notificationId: notificationReads.notificationId })
    .from(notificationReads)
    .where(
      and(
        eq(notificationReads.projectId, projectId),
        eq(notificationReads.userId, userId),
        inArray(notificationReads.notificationId, notificationIds)
      )
    );

  const readIds = new Set(readRows.map((r) => r.notificationId));

  return notifications.map((n) => ({
    ...n,
    isRead: readIds.has(n.id),
  }));
};

export const markNotificationsAsRead = async (input: z.input<typeof MarkNotificationsAsReadSchema>): Promise<void> => {
  const { userId, notificationIds, projectId } = MarkNotificationsAsReadSchema.parse(input);

  await db
    .insert(notificationReads)
    .values(notificationIds.map((notificationId) => ({ userId, notificationId, projectId })))
    .onConflictDoNothing();
};
