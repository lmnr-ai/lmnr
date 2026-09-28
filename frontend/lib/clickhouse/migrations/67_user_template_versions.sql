-- User-template versioning: the same two tables as system-prompt versioning
-- (migration 56), for the last-turn user group of each trace's winning LLM
-- span.

-- User-template version per winning span, resolved asynchronously by the
-- versioning consumer. Write-once: rows are never corrected after insert.
CREATE TABLE IF NOT EXISTS user_template_versions (
    project_id UUID,
    trace_id UUID,
    span_id UUID,
    agent_hash LowCardinality(String),
    version_hash LowCardinality(String),
    created_at DateTime64(9, 'UTC') DEFAULT now64(9)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, trace_id, span_id);

-- One row per version MINT: the template's static skeleton as TEXT plus the
-- mint's provenance. Append-only journal: the versioning pipeline never reads
-- it. Not partitioned, so a re-mint months later still collapses onto its
-- original row.
CREATE TABLE IF NOT EXISTS user_template_version_defs (
    project_id UUID,
    agent_hash LowCardinality(String),
    version_hash LowCardinality(String),
    static_text String CODEC(ZSTD(3)),
    static_lines UInt32,
    cluster_size UInt16,
    window_len UInt16,
    -- normal | forced_occurrence | forced_retry_budget
    mint_gate LowCardinality(String),
    example_trace_id UUID,
    example_span_id UUID,
    created_at DateTime64(9, 'UTC') DEFAULT now64(9)
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY (project_id, agent_hash, version_hash);
