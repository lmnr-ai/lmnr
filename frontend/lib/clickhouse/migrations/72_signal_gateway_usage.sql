-- One row per successful request through the hosted signals gateway
-- (`/v1/chat/completions`, Laminar Cloud only). Token counts come from the
-- upstream response's `usage`; `cache_read_tokens` is a subset of
-- `input_tokens`. Nothing reads or bills from this table yet.
CREATE TABLE IF NOT EXISTS signal_gateway_usage
(
    project_id UUID,
    workspace_id UUID,
    request_id UUID,
    timestamp DateTime64(9, 'UTC'),
    model String,
    input_tokens UInt64,
    cache_read_tokens UInt64,
    output_tokens UInt64
)
ENGINE = MergeTree
PARTITION BY toStartOfMonth(timestamp)
ORDER BY (workspace_id, project_id, timestamp);
