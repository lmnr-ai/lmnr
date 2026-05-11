CREATE TABLE IF NOT EXISTS labeling_queue_items (
    id              UUID,
    queue_id        UUID,
    project_id      UUID,

    payload         String,
    edit            String DEFAULT '',
    metadata        String DEFAULT '',

    status          UInt8  DEFAULT 0,

    idempotency_key String DEFAULT '',       -- empty = no caller-provided key

    created_at      DateTime64(3, 'UTC') DEFAULT now64(3),
    updated_at      DateTime64(3, 'UTC') DEFAULT now64(3)

) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, queue_id, id);

CREATE VIEW IF NOT EXISTS default.labeling_queue_items_v0 SQL SECURITY INVOKER AS
SELECT
    id              AS id,
    queue_id        AS queue_id,
    project_id      AS project_id,
    payload         AS payload,
    metadata        AS metadata,
    status          AS status,
    edit            AS edit,
    created_at      AS created_at,
    updated_at      AS updated_at
FROM default.labeling_queue_items FINAL
WHERE project_id = {project_id:UUID};
