CREATE TABLE IF NOT EXISTS labeling_queue_items (
    id              UUID,
    queue_id        UUID,
    project_id      UUID,

    payload         String,                  -- immutable {"data":..., "target":..., "metadata":...} set on insert
    edit            String DEFAULT '',       -- canonical current target as JSON, seeded equal to payload.target on insert and overwritten by UI edits
    metadata        String DEFAULT '',       -- arbitrary JSON, caller-defined

    status          UInt8  DEFAULT 0,        -- 0 unlabeled, 1 approved

    idempotency_key String DEFAULT '',       -- empty = no caller-provided key

    created_at      DateTime64(3, 'UTC') DEFAULT now64(3),
    updated_at      DateTime64(3, 'UTC') DEFAULT now64(3)

) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, queue_id, id);

-- Read view over `labeling_queue_items` for the query engine. The `edit`
-- column carries the canonical current target (seeded from payload.target on
-- insert; overwritten by every UI edit) — we re-expose it under the friendly
-- name `target` for ad-hoc SQL. `payload` is still available for callers who
-- want the original snapshot or non-target fields (`data`, `metadata`).
CREATE VIEW IF NOT EXISTS default.labeling_queue_items_v0 SQL SECURITY INVOKER AS
SELECT
    id              AS id,
    queue_id        AS queue_id,
    project_id      AS project_id,
    payload         AS payload,
    metadata        AS metadata,
    status          AS status,
    edit            AS target,
    created_at      AS created_at,
    updated_at      AS updated_at
FROM default.labeling_queue_items FINAL
WHERE project_id = {project_id:UUID};
