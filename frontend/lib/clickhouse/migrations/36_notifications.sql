CREATE TABLE IF NOT EXISTS notifications
(
    id                 UUID,
    project_id         UUID,
    workspace_id       UUID,
    definition_type    LowCardinality(String),
    definition_id      UUID,
    notification_data  String DEFAULT '',
    created_at         DateTime64(3, 'UTC')
)
ENGINE = MergeTree()
ORDER BY (workspace_id, definition_type, created_at)
