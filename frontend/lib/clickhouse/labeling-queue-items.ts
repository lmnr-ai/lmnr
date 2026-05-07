import { clickhouseClient } from "@/lib/clickhouse/client";
import { type LabelingQueueItem } from "@/lib/queue/types";

interface CHRow {
  id: string;
  queue_id: string;
  project_id: string;
  payload: string;
  metadata: string;
  is_labelled: boolean;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

const tryParseJson = <T>(raw: string, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const rowToItem = (row: CHRow): LabelingQueueItem => ({
  id: row.id,
  queueId: row.queue_id,
  projectId: row.project_id,
  payload: tryParseJson(row.payload, { data: {}, target: {} }),
  metadata: tryParseJson(row.metadata, {}),
  isLabelled: row.is_labelled,
  idempotencyKey: row.idempotency_key ?? "",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export interface InsertQueueItem {
  id: string;
  queueId: string;
  projectId: string;
  payload: unknown;
  metadata?: unknown;
  isLabelled?: boolean;
  idempotencyKey?: string;
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
      metadata: item.metadata !== undefined && item.metadata !== null ? JSON.stringify(item.metadata) : "",
      is_labelled: item.isLabelled ?? false,
      idempotency_key: item.idempotencyKey ?? "",
      created_at: createdAt,
      updated_at: updatedAt,
    };
  });

  await clickhouseClient.insert({
    table: "labeling_queue_items",
    values: rows,
    format: "JSONEachRow",
    clickhouse_settings: {
      wait_for_async_insert: 1,
      async_insert: 1,
    },
  });
};

export interface IdempotencyCollision {
  idempotencyKey: string;
}

/** Filter out items whose idempotency_key already exists for the queue. */
export const filterExistingIdempotencyKeys = async (
  projectId: string,
  queueId: string,
  keys: string[]
): Promise<Set<string>> => {
  const nonEmpty = keys.filter((k) => k.length > 0);
  if (nonEmpty.length === 0) return new Set();

  const query = `
    SELECT DISTINCT idempotency_key
    FROM labeling_queue_items FINAL
    WHERE project_id = {projectId: UUID}
      AND queue_id = {queueId: UUID}
      AND idempotency_key IN ({keys: Array(String)})
  `;

  const result = await clickhouseClient.query({
    query,
    query_params: { projectId, queueId, keys: nonEmpty },
    format: "JSONEachRow",
  });

  const rows = (await result.json()) as { idempotency_key: string }[];
  return new Set(rows.map((r) => r.idempotency_key));
};

interface CountRow {
  total: string;
  labelled: string;
}

export const getQueueCounts = async (
  projectId: string,
  queueId: string
): Promise<{ total: number; labelled: number }> => {
  const query = `
    SELECT
      count(*) AS total,
      countIf(is_labelled) AS labelled
    FROM labeling_queue_items FINAL
    WHERE project_id = {projectId: UUID}
      AND queue_id = {queueId: UUID}
  `;
  const result = await clickhouseClient.query({
    query,
    query_params: { projectId, queueId },
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as CountRow[];
  const row = rows[0];
  return {
    total: row ? Number(row.total) : 0,
    labelled: row ? Number(row.labelled) : 0,
  };
};

export const getQueueItems = async (
  projectId: string,
  queueId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<LabelingQueueItem[]> => {
  const { limit, offset } = options;
  const hasLimit = typeof limit === "number";
  const hasOffset = typeof offset === "number";
  const query = `
    SELECT
      toString(id) AS id,
      toString(queue_id) AS queue_id,
      toString(project_id) AS project_id,
      payload,
      metadata,
      is_labelled,
      idempotency_key,
      formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') AS created_at,
      formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%S.%fZ') AS updated_at
    FROM labeling_queue_items FINAL
    WHERE project_id = {projectId: UUID}
      AND queue_id = {queueId: UUID}
    ORDER BY created_at ASC, id ASC
    ${hasLimit ? "LIMIT {limit: UInt32}" : ""}
    ${hasLimit && hasOffset ? "OFFSET {offset: UInt32}" : ""}
  `;
  const query_params: Record<string, unknown> = { projectId, queueId };
  if (hasLimit) query_params.limit = limit;
  if (hasLimit && hasOffset) query_params.offset = offset;
  const result = await clickhouseClient.query({
    query,
    query_params,
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as CHRow[];
  return rows.map(rowToItem);
};

export const getQueueItemById = async (
  projectId: string,
  queueId: string,
  id: string
): Promise<LabelingQueueItem | null> => {
  const query = `
    SELECT
      toString(id) AS id,
      toString(queue_id) AS queue_id,
      toString(project_id) AS project_id,
      payload,
      metadata,
      is_labelled,
      idempotency_key,
      formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') AS created_at,
      formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%S.%fZ') AS updated_at
    FROM labeling_queue_items FINAL
    WHERE project_id = {projectId: UUID}
      AND queue_id = {queueId: UUID}
      AND id = {id: UUID}
    LIMIT 1
  `;
  const result = await clickhouseClient.query({
    query,
    query_params: { projectId, queueId, id },
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as CHRow[];
  return rows[0] ? rowToItem(rows[0]) : null;
};

export const getQueueItemsCount = async (projectId: string, queueId: string): Promise<number> => {
  const query = `
    SELECT count(*) AS total
    FROM labeling_queue_items FINAL
    WHERE project_id = {projectId: UUID}
      AND queue_id = {queueId: UUID}
  `;
  const result = await clickhouseClient.query({
    query,
    query_params: { projectId, queueId },
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as { total: string }[];
  return rows[0] ? Number(rows[0].total) : 0;
};

export interface UpdateQueueItemInput {
  id: string;
  queueId: string;
  projectId: string;
  payload?: unknown;
  metadata?: unknown;
  isLabelled?: boolean;
  idempotencyKey?: string;
  createdAt?: string;
}

/**
 * Upsert a queue item via ReplacingMergeTree. Fetches the current FINAL row
 * so we preserve immutable fields (createdAt, idempotency_key) while still
 * emitting a fresh `updated_at`.
 */
export const updateQueueItem = async (input: UpdateQueueItemInput): Promise<void> => {
  const existingQuery = `
    SELECT
      toString(id) AS id,
      toString(queue_id) AS queue_id,
      toString(project_id) AS project_id,
      payload,
      metadata,
      is_labelled,
      idempotency_key,
      formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') AS created_at,
      formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%S.%fZ') AS updated_at
    FROM labeling_queue_items FINAL
    WHERE project_id = {projectId: UUID}
      AND queue_id = {queueId: UUID}
      AND id = {id: UUID}
    LIMIT 1
  `;
  const existingResult = await clickhouseClient.query({
    query: existingQuery,
    query_params: { projectId: input.projectId, queueId: input.queueId, id: input.id },
    format: "JSONEachRow",
  });
  const existingRows = (await existingResult.json()) as CHRow[];
  const existing = existingRows[0];

  const payload =
    input.payload !== undefined
      ? input.payload
      : existing
        ? tryParseJson(existing.payload, { data: {}, target: {} })
        : { data: {}, target: {} };
  const metadata = input.metadata !== undefined ? input.metadata : existing ? tryParseJson(existing.metadata, {}) : {};
  const isLabelled = input.isLabelled ?? existing?.is_labelled ?? false;
  const idempotencyKey = input.idempotencyKey ?? existing?.idempotency_key ?? "";
  const createdAt = input.createdAt ?? existing?.created_at ?? new Date().toISOString();

  await insertQueueItems([
    {
      id: input.id,
      queueId: input.queueId,
      projectId: input.projectId,
      payload,
      metadata,
      isLabelled,
      idempotencyKey,
      createdAt,
      updatedAt: new Date().toISOString(),
    },
  ]);
};

/**
 * Permanently remove queue items by id. Uses ClickHouse lightweight DELETE —
 * writes a tombstone that subsequent FINAL reads respect.
 */
export const deleteQueueItems = async (projectId: string, queueId: string, ids: string[]): Promise<void> => {
  if (ids.length === 0) return;

  const query = `
    DELETE FROM labeling_queue_items
    WHERE project_id = {projectId: UUID}
      AND queue_id = {queueId: UUID}
      AND id IN ({ids: Array(UUID)})
  `;
  await clickhouseClient.command({
    query,
    query_params: { projectId, queueId, ids },
  });
};

export const deleteQueueItemsByQueueIds = async (projectId: string, queueIds: string[]): Promise<void> => {
  if (queueIds.length === 0) return;

  const query = `
    DELETE FROM labeling_queue_items
    WHERE project_id = {projectId: UUID}
      AND queue_id IN ({queueIds: Array(UUID)})
  `;
  await clickhouseClient.command({
    query,
    query_params: { projectId, queueIds },
  });
};

export const getLabelledQueueItems = async (projectId: string, queueId: string): Promise<LabelingQueueItem[]> => {
  const query = `
    SELECT
      toString(id) AS id,
      toString(queue_id) AS queue_id,
      toString(project_id) AS project_id,
      payload,
      metadata,
      is_labelled,
      idempotency_key,
      formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') AS created_at,
      formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%S.%fZ') AS updated_at
    FROM labeling_queue_items FINAL
    WHERE project_id = {projectId: UUID}
      AND queue_id = {queueId: UUID}
      AND is_labelled = true
    ORDER BY updated_at ASC, id ASC
  `;
  const result = await clickhouseClient.query({
    query,
    query_params: { projectId, queueId },
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as CHRow[];
  return rows.map(rowToItem);
};
