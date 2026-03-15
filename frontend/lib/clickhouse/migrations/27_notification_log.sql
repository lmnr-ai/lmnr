CREATE TABLE IF NOT EXISTS notification_log
(
    id                 UUID,
    workspace_id       UUID,
    project_id         UUID,
    definition_type    LowCardinality(String),
    definition_id      UUID,
    target_id          UUID,
    target_type        LowCardinality(String),
    channel_id         String DEFAULT '',
    channel_name       String DEFAULT '',
    email              String DEFAULT '',
    integration_id     UUID,
    payload            String DEFAULT '',
    created_at         DateTime64(3, 'UTC')
)
ENGINE = MergeTree()
ORDER BY (workspace_id, definition_type, created_at)
