import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { type LabelingQueueItem, type QueueProgress } from "@/lib/queue/types";
import { tryParseJson } from "@/lib/utils";

const SELECT_COLUMNS = `
  id,
  queue_id queueId,
  payload,
  edit,
  metadata,
  status,
  formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') createdAt,
  formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%S.%fZ') updatedAt
`;

type RawRow = Omit<LabelingQueueItem, "payload" | "metadata" | "projectId"> & {
  payload: string;
  metadata: string;
};

const parseRow = (projectId: string, row: RawRow): LabelingQueueItem => ({
  ...row,
  projectId,
  payload: tryParseJson(row.payload) ?? { data: {}, target: {} },
  metadata: tryParseJson(row.metadata) ?? {},
});

export type QueueItemState = "new" | "modified" | "approved";

export interface QueueItemStateRow {
  id: string;
  state: QueueItemState;
}

export interface InsertQueueItem {
  id: string;
  queueId: string;
  projectId: string;
  payload: unknown;
  metadata?: unknown;
  edit?: string;
  status?: 0 | 1;
  createdAt?: string;
  updatedAt?: string;
}

const toIso = (value?: string): string => value ?? new Date().toISOString();

export const insertQueueItems = async (items: InsertQueueItem[]): Promise<void> => {
  if (items.length === 0) return;

  const rows = items.map((item) => {
    const createdAt = toIso(item.createdAt);
    const updatedAt = toIso(item.updatedAt ?? createdAt);
    return {
      id: item.id,
      queue_id: item.queueId,
      project_id: item.projectId,
      payload: item.payload !== undefined && item.payload !== null ? JSON.stringify(item.payload) : "{}",
      edit: item.edit ?? "",
      metadata: item.metadata !== undefined && item.metadata !== null ? JSON.stringify(item.metadata) : "",
      status: item.status ?? 0,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  });

  // Synchronous insert: `updateQueueItem`'s read-modify-write must see this
  // row on the next FINAL SELECT (async buffer flushes ~200ms apart).
  await clickhouseClient.insert({
    table: "labeling_queue_items",
    values: rows,
    format: "JSONEachRow",
    clickhouse_settings: { async_insert: 0 },
  });
};

export const getQueueItems = async (
  projectId: string,
  queueId: string,
  options: { limit?: number; offset?: number; ids?: string[] } = {}
): Promise<LabelingQueueItem[]> => {
  const { limit, offset, ids } = options;
  const hasLimit = typeof limit === "number";
  const hasOffset = typeof offset === "number";
  const hasIds = Array.isArray(ids);
  // ClickHouse rejects `IN ()` as a syntax error — short-circuit empty filters.
  if (hasIds && ids.length === 0) return [];

  const parameters: Record<string, unknown> = { queueId };
  if (hasLimit) parameters.limit = limit;
  if (hasLimit && hasOffset) parameters.offset = offset;
  if (hasIds) parameters.ids = ids;

  const rows = await executeQuery<RawRow>({
    projectId,
    query: `
      SELECT ${SELECT_COLUMNS}
      FROM labeling_queue_items
      WHERE queue_id = {queueId: UUID}
        ${hasIds ? "AND id IN ({ids: Array(UUID)})" : ""}
      ORDER BY created_at ASC, id ASC
      ${hasLimit ? "LIMIT {limit: UInt32}" : ""}
      ${hasLimit && hasOffset ? "OFFSET {offset: UInt32}" : ""}
    `,
    parameters,
  });
  return rows.map((row) => parseRow(projectId, row));
};

export const getQueueItemStates = async (projectId: string, queueId: string): Promise<QueueItemStateRow[]> =>
  executeQuery<QueueItemStateRow>({
    projectId,
    query: `
      SELECT
        id,
        multiIf(
          status = 1, 'approved',
          edit = JSONExtractRaw(payload, 'target'), 'new',
          'modified'
        ) AS state
      FROM labeling_queue_items
      WHERE queue_id = {queueId: UUID}
      ORDER BY created_at ASC, id ASC
    `,
    parameters: { queueId },
  });

// SQL expressions for each progress bucket — kept identical to the row-level
// derivation in `getQueueItemStates` / frontend `deriveItemState` so HAVING
// totals never disagree with what the navigator bar shows for the same queue.
const PROGRESS_EXPR = {
  total: "count()",
  new: "countIf(status = 0 AND edit = JSONExtractRaw(payload, 'target'))",
  modified: "countIf(status = 0 AND edit != JSONExtractRaw(payload, 'target'))",
  approved: "countIf(status = 1)",
} as const;

export type ProgressColumn = keyof typeof PROGRESS_EXPR;
export type ProgressOperator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte";

const PROGRESS_OP_SQL: Record<ProgressOperator, string> = {
  eq: "=",
  ne: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};

export interface ProgressFilter {
  column: ProgressColumn;
  operator: ProgressOperator;
  value: number;
}

// Pre-filter queue ids by lifecycle counts via a CH GROUP BY ... HAVING. Used
// by the queues list endpoint to support filters like `approved > 5` without
// pulling every queue into Postgres. Combined filters are AND-ed.
//
// Limitation: only queues that have ≥ 1 item are scanned by the GROUP BY, so
// `total = 0` / `<state> = 0` predicates do NOT match empty queues. We accept
// that here rather than UNION-ing in the empty set — the common filters
// (`approved > 0`, `new > 0`, `total > N`) work as expected; if "show me
// queues with zero approved" becomes a real ask we can add an inverse branch.
export const findQueueIdsByProgress = async (projectId: string, filters: ProgressFilter[]): Promise<string[]> => {
  if (filters.length === 0) return [];

  const conditions: string[] = [];
  const parameters: Record<string, unknown> = {};
  filters.forEach((f, i) => {
    const paramKey = `pv${i}`;
    const value = Math.max(0, Math.trunc(Number(f.value) || 0));
    conditions.push(`${PROGRESS_EXPR[f.column]} ${PROGRESS_OP_SQL[f.operator]} {${paramKey}: UInt64}`);
    parameters[paramKey] = value;
  });

  const rows = await executeQuery<{ queueId: string }>({
    projectId,
    query: `
      SELECT queue_id queueId
      FROM labeling_queue_items
      GROUP BY queue_id
      HAVING ${conditions.join(" AND ")}
    `,
    parameters,
  });
  return rows.map((r) => r.queueId);
};

// Per-queue lifecycle counts for the queues list page. Uses the same
// `multiIf(status, edit == JSONExtractRaw(payload, 'target'))` derivation
// as `getQueueItemStates` so totals stay consistent with the navigator bar.
// Empty `queueIds` short-circuits — `IN ()` is a CH syntax error.
export const getQueueProgresses = async (
  projectId: string,
  queueIds: string[]
): Promise<Record<string, QueueProgress>> => {
  if (queueIds.length === 0) return {};

  const rows = await executeQuery<{
    queueId: string;
    new: number;
    modified: number;
    approved: number;
  }>({
    projectId,
    query: `
      SELECT
        queue_id queueId,
        countIf(status = 0 AND edit = JSONExtractRaw(payload, 'target')) AS new,
        countIf(status = 0 AND edit != JSONExtractRaw(payload, 'target')) AS modified,
        countIf(status = 1) AS approved
      FROM labeling_queue_items
      WHERE queue_id IN ({queueIds: Array(UUID)})
      GROUP BY queue_id
    `,
    parameters: { queueIds },
  });

  const result: Record<string, QueueProgress> = {};
  for (const row of rows) {
    result[row.queueId] = {
      total: row.new + row.modified + row.approved,
      new: row.new,
      modified: row.modified,
      approved: row.approved,
    };
  }
  return result;
};

export const getApprovedQueueItems = async (projectId: string, queueId: string): Promise<LabelingQueueItem[]> => {
  const rows = await executeQuery<RawRow>({
    projectId,
    query: `
      SELECT ${SELECT_COLUMNS}
      FROM labeling_queue_items
      WHERE queue_id = {queueId: UUID}
        AND status = 1
      ORDER BY updated_at ASC, id ASC
    `,
    parameters: { queueId },
  });
  return rows.map((row) => parseRow(projectId, row));
};

export interface UpdateQueueItemInput {
  id: string;
  queueId: string;
  projectId: string;
  edit?: string;
  status?: 0 | 1;
}

// Read-modify-write upsert: preserve immutable fields (`payload`, `metadata`,
// `createdAt`) while emitting fresh `edit` / `status` / `updated_at`.
export const updateQueueItem = async (input: UpdateQueueItemInput): Promise<void> => {
  const [existing] = await getQueueItems(input.projectId, input.queueId, { ids: [input.id] });

  const payload = existing?.payload ?? { data: {}, target: {} };
  const metadata = existing?.metadata ?? {};
  const edit = input.edit !== undefined ? input.edit : (existing?.edit ?? "");
  const status = input.status ?? existing?.status ?? 0;
  const createdAt = existing?.createdAt ?? new Date().toISOString();

  await insertQueueItems([
    {
      id: input.id,
      queueId: input.queueId,
      projectId: input.projectId,
      payload,
      metadata,
      edit,
      status,
      createdAt,
      updatedAt: new Date().toISOString(),
    },
  ]);
};

export const deleteQueueItems = async (projectId: string, queueId: string, ids: string[]): Promise<void> => {
  if (ids.length === 0) return;

  await clickhouseClient.command({
    query: `
      DELETE FROM labeling_queue_items
      WHERE project_id = {projectId: UUID}
        AND queue_id = {queueId: UUID}
        AND id IN ({ids: Array(UUID)})
    `,
    query_params: { projectId, queueId, ids },
  });
};

export const deleteQueueItemsByQueueIds = async (projectId: string, queueIds: string[]): Promise<void> => {
  if (queueIds.length === 0) return;

  await clickhouseClient.command({
    query: `
      DELETE FROM labeling_queue_items
      WHERE project_id = {projectId: UUID}
        AND queue_id IN ({queueIds: Array(UUID)})
    `,
    query_params: { projectId, queueIds },
  });
};
