-- Write-once (static) parts of a trace, split out of traces_agg (LAM-2026).
-- These columns are SET, not aggregated: 1..N writes per trace, latest wins.
--
-- CoalescingMergeTree resolves each column independently: NULL means "no
-- update from this write" and never erases a prior value, so a batch can
-- write only the columns it actually learned about.
--
-- Resolution is by INSERTION ORDER (last non-NULL write per column wins), NOT
-- by `updated_at` — CoalescingMergeTree takes no version parameter (its
-- optional argument is a columns-to-coalesce list, SummingMergeTree-style).
-- `updated_at` is therefore purely informational, never a version.
--
-- DELIBERATELY NOT PARTITIONED. Coalescing only happens WITHIN a partition, so
-- partitioning on any per-write timestamp splits a trace whose writes straddle
-- a boundary into permanently-partial rows: the aggregation write would carry
-- the batch's min span start_time while the agent-io write carries the winning
-- span's end time, and `TraceAggregation::start_time` is itself per-batch (min
-- over that batch's spans only), so even aggregation-only writes can disagree.
-- `OPTIMIZE ... FINAL` cannot repair it, and while a plain `SELECT ... FINAL`
-- happens to merge across partitions at query time,
-- `do_not_merge_across_partitions_select_final=1` (and any `updated_at`-filtered
-- read) exposes the split rows. No partition key means every write for a trace
-- always merges. Project purges use `ALTER TABLE ... DELETE WHERE project_id`,
-- which needs no partitioning.
--
-- `output_hashes` is a concatenated lowercase-hex string (64 chars per
-- 32-byte hash), not Array(FixedString(32)): Nullable(Array(...)) is
-- rejected by ClickHouse, and a non-Nullable Array has no NULL hole — an
-- omitted array arrives as [] and would clobber a real value. Reconstruct at
-- read with
--   arrayMap(i -> unhex(substring(output_hashes, i * 64 + 1, 64)),
--            range(0, intDiv(length(output_hashes), 64)))
-- which yields Array(String) that dictGet accepts for a FixedString(32) key.
--
-- `root_span_type` lists PIPELINE = 2 even though no view surfaces it: an
-- out-of-range Enum8 int is accepted at INSERT but poisons every later read
-- of the part with UNKNOWN_ELEMENT_OF_ENUM, and SpanType::Pipeline = 2 is a
-- reachable value. Keep this enum covering the full `Into<u8> for SpanType`
-- range.
CREATE TABLE IF NOT EXISTS default.traces_static
(
    `project_id` UUID,
    `trace_id` UUID,
    `updated_at` DateTime64(9, 'UTC'),
    `input` Nullable(String) CODEC(ZSTD(3)),
    `output_hashes` Nullable(String) CODEC(ZSTD(3)),
    `user_id` Nullable(String),
    `session_id` Nullable(String),
    `metadata` Nullable(String) CODEC(ZSTD(3)),
    `root_span_id` Nullable(UUID),
    `root_span_name` Nullable(String),
    `root_span_type` Nullable(Enum8('DEFAULT' = 0, 'LLM' = 1, 'PIPELINE' = 2, 'EXECUTOR' = 3,
        'EVALUATOR' = 4, 'EVALUATION' = 5, 'TOOL' = 6, 'HUMAN_EVALUATOR' = 7, 'CACHED' = 8)),
    `status` Nullable(Enum8('success' = 1, 'error' = 2)),
    `has_browser_session` Nullable(UInt8),
    `trace_type` Nullable(Enum8('DEFAULT' = 0, 'EVALUATION' = 1, 'EVENT' = 2, 'PLAYGROUND' = 3)),
    -- reserved, no writer yet
    `internal_metadata` Nullable(String) CODEC(ZSTD(3)),
    INDEX traces_static_session_id_idx session_id TYPE bloom_filter,
    INDEX traces_static_user_id_idx user_id TYPE bloom_filter
)
ENGINE = CoalescingMergeTree()
ORDER BY (project_id, trace_id)
SETTINGS index_granularity = 8192;
