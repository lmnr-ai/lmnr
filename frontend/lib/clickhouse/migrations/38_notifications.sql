CREATE TABLE IF NOT EXISTS notifications
(
    notification_id    UUID,
    project_id         UUID,
    workspace_id       UUID,
    definition_type    LowCardinality(String),
    definition_id      UUID,
    payload            String DEFAULT '',
    created_at         DateTime64(3, 'UTC')
)
ENGINE = MergeTree()
ORDER BY (workspace_id, project_id, definition_type, created_at);

CREATE TABLE IF NOT EXISTS notification_deliveries
(
    workspace_id       UUID,
    project_id         UUID,
    notification_id    UUID,
    delivery_id        UUID,
    target_id          UUID,
    target_type        LowCardinality(String),
    message            String DEFAULT '',
    created_at         DateTime64(3, 'UTC')
)
ENGINE = MergeTree()
ORDER BY (workspace_id, project_id, notification_id, created_at);
