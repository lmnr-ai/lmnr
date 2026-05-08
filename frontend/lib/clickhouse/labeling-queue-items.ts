import { clickhouseClient } from "@/lib/clickhouse/client";
import { type LabelingQueueItem } from "@/lib/queue/types";
import { tryParseJson } from "@/lib/utils";

/**
 * Shared SELECT list for `LabelingQueueItem` reads. Uses ClickHouse implicit
 * camelCase aliases so JSONEachRow returns keys matching the TS shape directly
 * — no per-row remapping needed. UUID columns serialise as strings via
 * JSONEachRow without an explicit `toString()` cast; we deliberately do NOT
 * alias them with their original snake_case name (e.g. `toString(project_id)
 * AS project_id`) because the ClickHouse analyzer would then resolve
 * `WHERE project_id = {... UUID}` to the String alias and fail with
 * `no supertype for types String, UUID`. `idempotency_key` is intentionally
 * NOT selected — it's an API-caller-facing concern owned by the Rust ingest
 * path; the frontend has no use for it.
 */
const SELECT_COLUMNS = `
  id,
  queue_id queueId,
  project_id projectId,
  payload,
  metadata,
  is_labelled isLabelled,
  formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') createdAt,
  formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%S.%fZ') updatedAt
`;

type RawRow = Omit<LabelingQueueItem, "payload" | "metadata"> & {
  payload: string;
  metadata: string;
};

const parseRow = (row: RawRow): LabelingQueueItem => ({
  ...row,
  payload: tryParseJson(row.payload) ?? { data: {}, target: {} },
  metadata: tryParseJson(row.metadata) ?? {},
});

export interface InsertQueueItem {
  id: string;
  queueId: string;
  projectId: string;
  payload: unknown;
  metadata?: unknown;
  isLabelled?: boolean;
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
      created_at: createdAt,
      updated_at: updatedAt,
    };
  });

  await clickhouseClient.insert({
    table: "labeling_queue_items",
    values: rows,
    format: "JSONEachRow",
    // Synchronous insert — `updateQueueItem` reads the just-inserted row back via
    // FINAL during its read-modify-write. With `async_insert: 1`, the ack returns
    // when the row enters the async buffer (typically flushed every 200ms), so
    // the next SELECT FINAL can miss it and the RMW would restore defaults
    // (e.g. fresh `createdAt`). The client-level default (`client.ts`) stays
    // async for high-throughput tables; we opt out here.
    clickhouse_settings: {
      async_insert: 0,
    },
  });
};

export const getQueueCounts = async (
  projectId: string,
  queueId: string
): Promise<{ total: number; labelled: number }> => {
  const result = await clickhouseClient.query({
    query: `
      SELECT
        count(*) AS total,
        countIf(is_labelled) AS labelled
      FROM labeling_queue_items FINAL
      WHERE project_id = {projectId: UUID}
        AND queue_id = {queueId: UUID}
    `,
    query_params: { projectId, queueId },
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as { total: string; labelled: string }[];
  const row = rows[0];
  return {
    total: row ? Number(row.total) : 0,
    labelled: row ? Number(row.labelled) : 0,
  };
};

export const getQueueItems = async (
  projectId: string,
  queueId: string,
  options: { limit?: number; offset?: number; ids?: string[] } = {}
): Promise<LabelingQueueItem[]> => {
  const { limit, offset, ids } = options;
  const hasLimit = typeof limit === "number";
  const hasOffset = typeof offset === "number";
  // `ids` is opt-in for the windowed UI fetcher: pass an explicit list and we
  // return only those rows (still ordered by created_at). An empty array
  // short-circuits — without this guard, ClickHouse would parse `IN ()` as a
  // syntax error and ALL queue items would 500 the route.
  const hasIds = Array.isArray(ids);
  if (hasIds && ids.length === 0) return [];

  const query_params: Record<string, unknown> = { projectId, queueId };
  if (hasLimit) query_params.limit = limit;
  if (hasLimit && hasOffset) query_params.offset = offset;
  if (hasIds) query_params.ids = ids;

  const result = await clickhouseClient.query({
    query: `
      SELECT ${SELECT_COLUMNS}
      FROM labeling_queue_items FINAL
      WHERE project_id = {projectId: UUID}
        AND queue_id = {queueId: UUID}
        ${hasIds ? "AND id IN ({ids: Array(UUID)})" : ""}
      ORDER BY created_at ASC, id ASC
      ${hasLimit ? "LIMIT {limit: UInt32}" : ""}
      ${hasLimit && hasOffset ? "OFFSET {offset: UInt32}" : ""}
    `,
    query_params,
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as RawRow[];
  return rows.map(parseRow);
};

/**
 * Lightweight ordered-id listing for the windowed UI: returns the full
 * `(created_at, id)` ordering as a flat string array without paying for any
 * payload/metadata bytes. The queue page hydrates this once and uses it as
 * the master index so navigation can step through positions whose underlying
 * items haven't been fetched yet.
 */
export const getQueueItemIds = async (projectId: string, queueId: string): Promise<string[]> => {
  const result = await clickhouseClient.query({
    query: `
      SELECT id
      FROM labeling_queue_items FINAL
      WHERE project_id = {projectId: UUID}
        AND queue_id = {queueId: UUID}
      ORDER BY created_at ASC, id ASC
    `,
    query_params: { projectId, queueId },
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as { id: string }[];
  return rows.map((row) => row.id);
};

export const getLabelledQueueItems = async (projectId: string, queueId: string): Promise<LabelingQueueItem[]> => {
  const result = await clickhouseClient.query({
    query: `
      SELECT ${SELECT_COLUMNS}
      FROM labeling_queue_items FINAL
      WHERE project_id = {projectId: UUID}
        AND queue_id = {queueId: UUID}
        AND is_labelled = true
      ORDER BY updated_at ASC, id ASC
    `,
    query_params: { projectId, queueId },
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as RawRow[];
  return rows.map(parseRow);
};

export interface UpdateQueueItemInput {
  id: string;
  queueId: string;
  projectId: string;
  payload?: unknown;
  /**
   * Partial payload patch — merged into `existing.payload` with `target` taking
   * precedence. Use this instead of fetching and re-sending the full payload
   * from the caller, which doubles the number of FINAL round-trips per update.
   * Ignored when `payload` is set explicitly.
   */
  target?: unknown;
  metadata?: unknown;
  isLabelled?: boolean;
  createdAt?: string;
}

/**
 * Upsert a queue item via ReplacingMergeTree. Fetches the current FINAL row
 * so we preserve `createdAt` while still emitting a fresh `updated_at`.
 *
 * Note on `idempotency_key`: the frontend write path leaves the column at its
 * CH `DEFAULT ''` and does NOT preserve any existing key. If the API later
 * retries with the same key, the FINAL pre-check in Rust treats the row as
 * absent and re-inserts — but the inserted `id` is deterministic (UUIDv5 over
 * `(project_id, queue_id, idempotency_key)`), so the retry collides on the
 * RMT sort key and collapses on merge / FINAL with the latest write winning.
 * Net cost: at most one redundant insert per UI-edit-then-retry sequence; no
 * duplicate row ever surfaces.
 */
export const updateQueueItem = async (input: UpdateQueueItemInput): Promise<void> => {
  const existingResult = await clickhouseClient.query({
    query: `
      SELECT ${SELECT_COLUMNS}
      FROM labeling_queue_items FINAL
      WHERE project_id = {projectId: UUID}
        AND queue_id = {queueId: UUID}
        AND id = {id: UUID}
      LIMIT 1
    `,
    query_params: { projectId: input.projectId, queueId: input.queueId, id: input.id },
    format: "JSONEachRow",
  });
  const existingRows = (await existingResult.json()) as RawRow[];
  const existing = existingRows[0] ? parseRow(existingRows[0]) : undefined;

  const existingPayload = existing?.payload ?? { data: {}, target: {} };
  const payload =
    input.payload !== undefined
      ? input.payload
      : input.target !== undefined
        ? { ...existingPayload, target: input.target }
        : existingPayload;
  const metadata = input.metadata !== undefined ? input.metadata : (existing?.metadata ?? {});
  const isLabelled = input.isLabelled ?? existing?.isLabelled ?? false;
  const createdAt = input.createdAt ?? existing?.createdAt ?? new Date().toISOString();

  await insertQueueItems([
    {
      id: input.id,
      queueId: input.queueId,
      projectId: input.projectId,
      payload,
      metadata,
      isLabelled,
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
