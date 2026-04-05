import { clickhouseClient } from "@/lib/clickhouse/client";

export interface WebNotification {
  id: string;
  workspaceId: string;
  projectId: string;
  definitionType: string;
  definitionId: string;
  payload: string;
  createdAt: string;
}

export const getWebNotifications = async (workspaceId: string, limit = 5): Promise<WebNotification[]> => {
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

  return (await result.json()) as WebNotification[];
};
