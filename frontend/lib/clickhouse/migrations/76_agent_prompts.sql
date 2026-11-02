-- Agent versioning input: one row per production LLM span with a system
-- prompt, written by the spans consumer. `line_hashes` is the sorted set of
-- the agent prompt's (system prompt + tool definitions) line hashes, dates and
-- times masked. The scheduled agent versioning job reads it per agent_hash;
-- rows only need to outlive its max hold.
CREATE TABLE IF NOT EXISTS agent_prompts (
    project_id UUID,
    agent_hash LowCardinality(String),
    trace_id UUID,
    span_id UUID,
    start_time DateTime64(9, 'UTC'),
    model LowCardinality(String),
    line_hashes Array(UInt64) CODEC(ZSTD(3)),
    ingested_at DateTime64(9, 'UTC') DEFAULT now64(9)
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(ingested_at)
ORDER BY (project_id, agent_hash, start_time)
TTL toDateTime(ingested_at) + INTERVAL 7 DAY;
