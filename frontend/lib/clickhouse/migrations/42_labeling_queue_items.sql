CREATE TABLE IF NOT EXISTS labeling_queue_items (
    id              UUID,
    queue_id        UUID,
    project_id      UUID,

    payload         String,                  -- {"data": ..., "target": ...}, target is mutable
    metadata        String DEFAULT '',       -- arbitrary JSON, caller-defined

    is_labelled     Bool DEFAULT false,      -- user finalized this item (commit on "next")

    idempotency_key String DEFAULT '',       -- empty = no caller-provided key

    created_at      DateTime64(3, 'UTC') DEFAULT now64(3),
    updated_at      DateTime64(3, 'UTC') DEFAULT now64(3)

) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, queue_id, id);
