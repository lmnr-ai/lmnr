import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { type LabelingQueueItem, type QueueProgress } from "@/lib/queue/types";
import { generateSequentialUuidsV7, tryParseJson } from "@/lib/utils";

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

interface InsertQueueItem {
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

  // Sync insert so `updateQueueItem`'s FINAL read sees the row immediately.
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
  if (hasIds && ids.length === 0) return [];

  const parameters: Record<string, unknown> = { queueId };
  if (hasLimit) parameters.limit = limit;
  if (hasLimit && hasOffset) parameters.offset = offset;
  if (hasIds) parameters.ids = ids;

  const rows = await executeQuery<RawRow>({
    projectId,
    query: `
      SELECT ${SELECT_COLUMNS}
      FROM labeling_queue_items FINAL
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
      FROM labeling_queue_items FINAL
      WHERE queue_id = {queueId: UUID}
      ORDER BY created_at ASC, id ASC
    `,
    parameters: { queueId },
  });

// Bucket expressions kept identical to `getQueueItemStates` / frontend `deriveItemState`.
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

// GROUP BY only sees queues with ≥ 1 item, so `<col> = 0` won't match empty queues.
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
      FROM labeling_queue_items FINAL
      GROUP BY queue_id
      HAVING ${conditions.join(" AND ")}
    `,
    parameters,
  });
  return rows.map((r) => r.queueId);
};

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
      FROM labeling_queue_items FINAL
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

// Server-side push to `dataset_datapoints` via INSERT…SELECT (no payload bodies cross the wire).
// `edit` → `target` directly under the mirror model; dp ids minted in JS and zipped by row position.
export const copyQueueItemsToDataset = async (
  projectId: string,
  queueId: string,
  datasetId: string,
  options: { ids?: string[]; includeUnlabelled?: boolean } = {}
): Promise<number> => {
  const { ids, includeUnlabelled } = options;
  const hasIds = Array.isArray(ids);
  if (hasIds && ids.length === 0) return 0;

  const selectParams: Record<string, unknown> = { queueId };
  if (hasIds) selectParams.ids = ids;

  const matchedRows = await executeQuery<{ id: string }>({
    projectId,
    query: `
      SELECT id
      FROM labeling_queue_items FINAL
      WHERE queue_id = {queueId: UUID}
        ${includeUnlabelled ? "" : "AND status = 1"}
        ${hasIds ? "AND id IN ({ids: Array(UUID)})" : ""}
      ORDER BY id
    `,
    parameters: selectParams,
  });

  if (matchedRows.length === 0) return 0;

  const matchedIds = matchedRows.map((r) => r.id);
  const newIds = generateSequentialUuidsV7(matchedIds.length);

  // `row_number() OVER (ORDER BY id)` matches the preflight order so positional zip is stable.
  // `toString(id) IN Array(String)` because `Array(UUID)` binding via `command` empirically didn't match.
  await clickhouseClient.command({
    query: `
      INSERT INTO dataset_datapoints (id, dataset_id, project_id, created_at, data, target, metadata)
      SELECT
        arrayElement({newIds: Array(UUID)}, rn) AS id,
        {datasetId: UUID} AS dataset_id,
        project_id,
        now64(9, 'UTC') AS created_at,
        JSONExtractRaw(payload, 'data') AS data,
        edit AS target,
        JSONExtractRaw(payload, 'metadata') AS metadata
      FROM (
        SELECT
          *,
          row_number() OVER (ORDER BY id) AS rn
        FROM labeling_queue_items FINAL
        WHERE project_id = {projectId: UUID}
          AND queue_id = {queueId: UUID}
          AND toString(id) IN ({matchedIds: Array(String)})
      )
    `,
    query_params: { projectId, queueId, datasetId, matchedIds, newIds },
    clickhouse_settings: { async_insert: 0 },
  });

  // Verify by minted id before deleting source rows — guards against the previous zero-UUID zip bug.
  const verifyRows = await executeQuery<{ c: number }>({
    projectId,
    query: `
      SELECT count() AS c
      FROM dataset_datapoints
      WHERE dataset_id = {datasetId: UUID}
        AND toString(id) IN ({newIds: Array(String)})
    `,
    parameters: { datasetId, newIds },
  });
  const inserted = Number(verifyRows[0]?.c ?? 0);

  if (inserted !== matchedIds.length) {
    throw new Error(
      `push-to-dataset: expected ${matchedIds.length} rows inserted, got ${inserted}. Queue rows preserved.`
    );
  }

  await deleteQueueItems(projectId, queueId, matchedIds);
  return matchedIds.length;
};

interface UpdateQueueItemInput {
  id: string;
  queueId: string;
  projectId: string;
  edit?: string;
  status?: 0 | 1;
}

// Read-modify-write upsert. FINAL read collapses unmerged versions so partial PATCHes
// (e.g. `{ edit }`-only after `{ status: 1 }`) inherit current `status` instead of reverting.
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
