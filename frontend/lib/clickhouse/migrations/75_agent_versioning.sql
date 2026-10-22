-- Agent versioning (app-server `agent_versioning`): agent calls recorded at
-- ingestion, the display text of their lines, and the version detected for
-- each trace. Postgres `agent_versions` holds the versions themselves.

-- One row per LLM span with a system prompt: the masked-line hashes of its
-- system prompt and tool set, in document order. Microsecond times so a
-- trace's time round-trips through Postgres timestamptz exactly. Past an
-- agent's first run the detection job reads only recent calls, so the TTL
-- only bounds how much history a first run sees.
CREATE TABLE IF NOT EXISTS agent_calls (
    project_id UUID,
    agent_hash LowCardinality(String),
    trace_id UUID,
    span_id UUID,
    start_time DateTime64(6, 'UTC'),
    line_hashes Array(UInt64) CODEC(ZSTD(3))
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(start_time)
ORDER BY (project_id, agent_hash, start_time)
TTL toDateTime(start_time) + INTERVAL 30 DAY;

-- Display text of each line hash, written the first time a call carrying it
-- ships its text. Not partitioned and never expired: a version's content can
-- be rebuilt from it at any time.
CREATE TABLE IF NOT EXISTS agent_lines (
    project_id UUID,
    agent_hash LowCardinality(String),
    line_hash UInt64,
    text String CODEC(ZSTD(3)),
    created_at DateTime64(9, 'UTC') DEFAULT now64(9)
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY (project_id, agent_hash, line_hash);

-- The agent version of each trace, keyed by Postgres `agents.id` and
-- `agent_versions.id`. A trace is relabelled until `settled`; the latest
-- `updated_at` wins. `agent_version_id` is NULL for a held trace that does not
-- contain its version's core.
CREATE TABLE IF NOT EXISTS trace_agent_versions (
    project_id UUID,
    trace_id UUID,
    agent_id UUID,
    agent_version_id Nullable(UUID),
    settled Bool,
    start_time DateTime64(6, 'UTC'),
    updated_at DateTime64(9, 'UTC') DEFAULT now64(9)
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, trace_id, agent_id);
