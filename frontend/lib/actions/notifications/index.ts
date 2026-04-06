import { and, eq, inArray } from "drizzle-orm";

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

export const getWebNotifications = async (
  workspaceId: string,
  userId: string,
  projectId: string,
  limit = 5
): Promise<WebNotification[]> => {
  const result = await clickhouseClient.query({
    query: `
      SELECT
        id,
        workspace_id as workspaceId,
        project_id as projectId,
        definition_type as definitionType,
        definition_id as definitionId,
        payload,
        created_at as createdAt
      FROM notification_logs
      WHERE workspace_id = {workspaceId: UUID}
        AND target_type = 'WEB'
        AND definition_type = 'REPORT'
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
  // Query by user_id + notification_ids only. The PK is (user_id, notification_id),
  // so read status is per-user per-notification regardless of project context.
  const readRows = await db
    .select({ notificationId: notificationReads.notificationId })
    .from(notificationReads)
    .where(and(eq(notificationReads.userId, userId), inArray(notificationReads.notificationId, notificationIds)));

  const readIds = new Set(readRows.map((r) => r.notificationId));

  return notifications.map((n) => ({
    ...n,
    isRead: readIds.has(n.id),
  }));
};

export const markNotificationAsRead = async (
  userId: string,
  notificationId: string,
  projectId: string
): Promise<void> => {
  await db.insert(notificationReads).values({ userId, notificationId, projectId }).onConflictDoNothing();
};
