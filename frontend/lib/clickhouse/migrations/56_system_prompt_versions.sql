-- System-prompt version per LLM span, resolved asynchronously by the
-- static-prompt extraction pipeline (v2). Write-once: rows are never
-- corrected after insert.
CREATE TABLE IF NOT EXISTS system_prompt_versions (
    project_id UUID,
    trace_id UUID,
    span_id UUID,
    agent_hash LowCardinality(String),
    static_prompt_version_hash LowCardinality(String),
    created_at DateTime64(9, 'UTC') DEFAULT now64(9)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, trace_id, span_id);

-- One row per version MINT: the static skeleton as TEXT behind a
-- `static_prompt_version_hash` (the registry keeps only 64-bit line hashes, so
-- this is the only durable record of the text) plus the mint's provenance.
-- Append-only journal: the versioning pipeline never reads it — Redis stays the
-- runtime source of truth.
--
-- Not partitioned: volume is one row per mint, and merges don't cross
-- partitions, so a re-mint months later still collapses onto its original row.
CREATE TABLE IF NOT EXISTS system_prompt_version_defs (
    project_id UUID,
    agent_hash LowCardinality(String),
    version_hash LowCardinality(String),
    static_text String CODEC(ZSTD(3)),
    static_lines UInt32,
    -- Window prompts intersected into `static_text`, and the window's total
    -- population at mint time.
    cluster_size UInt16,
    window_len UInt16,
    -- normal | forced_occurrence | forced_retry_budget
    mint_gate LowCardinality(String),
    -- Span whose prompt triggered the mint; resolves the full raw body through
    -- `spans_v0` for as long as the span is retained.
    example_trace_id UUID,
    example_span_id UUID,
    created_at DateTime64(9, 'UTC') DEFAULT now64(9)
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY (project_id, agent_hash, version_hash);
