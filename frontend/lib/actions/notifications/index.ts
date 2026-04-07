import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { notificationReads } from "@/lib/db/migrations/schema";

export interface WebNotification {
  id: string;
  workspaceId: string;
  projectId: string;
  definitionType: string;
  definitionId: string;
  payload: string;
  createdAt: string;
  isRead: boolean;
}

const GetWebNotificationsSchema = z.object({
  workspaceId: z.guid(),
  userId: z.guid(),
  projectId: z.guid(),
  limit: z.number().int().positive().optional().default(30),
});

const MarkNotificationAsReadSchema = z.object({
  userId: z.guid(),
  notificationId: z.guid(),
  projectId: z.guid(),
});

export const getWebNotifications = async (
  input: z.input<typeof GetWebNotificationsSchema>
): Promise<WebNotification[]> => {
  const { workspaceId, userId, projectId, limit } = GetWebNotificationsSchema.parse(input);

  const result = await clickhouseClient.query({
    query: `
      SELECT
        id,
        workspace_id as workspaceId,
        project_id as projectId,
        definition_type as definitionType,
        definition_id as definitionId,
        payload,
        formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') as createdAt
      FROM notification_logs
      WHERE workspace_id = {workspaceId: UUID}
        AND target_type = 'WEB'
        AND definition_type = 'REPORT'
        AND created_at >= now() - INTERVAL 1 MONTH
      ORDER BY created_at DESC
      LIMIT {limit: UInt32}
    `,
    query_params: { workspaceId, limit },
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

export const markNotificationAsRead = async (input: z.infer<typeof MarkNotificationAsReadSchema>): Promise<void> => {
  const { userId, notificationId, projectId } = MarkNotificationAsReadSchema.parse(input);

  await db.insert(notificationReads).values({ userId, notificationId, projectId }).onConflictDoNothing();
};
