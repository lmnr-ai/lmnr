-- Workspace audit log (LAM-2460). Written only by app-server's audit consumer;
-- not in the query-engine allowlist, so the SQL editor, /v1/sql, MCP and the
-- agent cannot read it. Column order must match `ch::audit_events::AuditEventCHRow`.
CREATE TABLE IF NOT EXISTS audit_events
(
    event_id UUID,
    timestamp DateTime64(9, 'UTC'),
    inserted_at DateTime64(9, 'UTC'),
    workspace_id UUID,
    project_id UUID,
    project_name String,
    actor_type LowCardinality(String),
    actor_id UUID,
    actor_label String,
    actor_owner_user_id UUID,
    actor_owner_label String,
    source LowCardinality(String),
    resource_type LowCardinality(String),
    action LowCardinality(String),
    resource_id String,
    resource_label String,
    outcome LowCardinality(String),
    ip String,
    user_agent String,
    metadata String CODEC(ZSTD(3)),
    INDEX inserted_at_idx inserted_at TYPE minmax GRANULARITY 1
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (workspace_id, project_id, timestamp, event_id);
