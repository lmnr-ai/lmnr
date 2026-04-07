-- Notification events: one entry per notification event, regardless of how many
-- recipients it was sent to.
CREATE TABLE IF NOT EXISTS notifications
(
    id                 UUID,
    workspace_id       UUID,
    notification_kind  LowCardinality(String),
    payload            String DEFAULT '',
    created_at         DateTime64(3, 'UTC')
)
ENGINE = MergeTree()
ORDER BY (workspace_id, notification_kind, created_at);

-- Notification deliveries: one entry per delivery attempt (per recipient/channel).
CREATE TABLE IF NOT EXISTS notification_deliveries
(
    id                 UUID,
    notification_id    UUID,
    workspace_id       UUID,
    channel            LowCardinality(String),
    destination        String DEFAULT '',
    delivered          Bool DEFAULT true,
    created_at         DateTime64(3, 'UTC')
)
ENGINE = MergeTree()
ORDER BY (workspace_id, notification_id, created_at);
