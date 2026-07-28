-- Write-once (static) parts of a trace, split out of traces_agg (LAM-2026).
-- These columns are SET, not aggregated: 1..N writes per trace, latest wins.
--
-- CoalescingMergeTree resolves each column independently: NULL means "no
-- update from this write" and never erases a prior value, so a batch can
-- write only the columns it actually learned about.
--
-- Resolution is by INSERTION ORDER (last non-NULL write per column wins), NOT
-- by `start_time` — CoalescingMergeTree takes no version parameter (its
-- optional argument is a columns-to-coalesce list, SummingMergeTree-style).
--
-- `start_time` is the trace's start time (min span start), mirroring
-- traces_replacing / traces_agg so reads can push a PREWHERE down to it. It is
-- the partition key, and a partition-key column is NOT coalesced (it keeps the
-- first-arriving value) — which is fine, every write derives it from the same
-- trace.
--
-- Background merges do NOT merge across partitions, so a trace whose writes
-- straddle a month boundary keeps one part per partition. `SELECT ... FINAL`
-- DOES merge across partitions, so reads still see one coalesced row — that is
-- the accepted trade-off for partition pruning. Two consequences to respect:
--   1. Reads MUST NOT set `do_not_merge_across_partitions_select_final=1` on
--      this table; it would surface the per-partition partials.
--   2. Like traces_v0, a `start_time` predicate CLIPS partials: filtering to a
--      window that excludes one write's partition drops the columns only that
--      write carried. Callers must pad the bounds by more than the max trace
--      duration and re-apply exact bounds in their own WHERE.
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
-- `root_span_name` vs `root_span_name_fallback`: the real root span's name and
-- the span-path-derived preview name are SEPARATE columns, and the read path
-- resolves `coalesce(root_span_name, root_span_name_fallback)`. The fallback
-- exists to preview in-progress traces (and traces whose root span never
-- arrives). One column can't carry both under last-write-wins: a later batch
-- with no root span can't tell whether a real name was already written, so it
-- would clobber it — which is why traces_agg needs its '2'/'1' priority-prefix
-- hack to force max(String) to prefer the root-derived name, and is a real bug
-- in traces_replacing today (its `top_span_name = COALESCE(EXCLUDED..., ...)`
-- arm lets a later fallback overwrite the real name while `top_span_id` keeps
-- the root's, leaving the two desynced). Two nullable columns express the
-- precedence directly, so it holds regardless of arrival order and needs no
-- sentinel encoding.
--
-- `root_span_type` lists PIPELINE = 2 even though no view surfaces it: an
-- out-of-range Enum8 int is accepted at INSERT but poisons every later read
-- of the part with UNKNOWN_ELEMENT_OF_ENUM, and SpanType::Pipeline = 2 is a
-- reachable value. Keep this enum covering the full `Into<u8> for SpanType`
-- range.
--
-- Projections on a CoalescingMergeTree require
-- `deduplicate_merge_projection_mode = 'rebuild'` (the default `throw` refuses
-- the CREATE), same as traces_agg.
CREATE TABLE IF NOT EXISTS default.traces_static
(
    `project_id` UUID,
    `trace_id` UUID,
    `start_time` DateTime64(9, 'UTC'),
    `input` Nullable(String) CODEC(ZSTD(3)),
    `output_hashes` Nullable(String) CODEC(ZSTD(3)),
    `user_id` Nullable(String),
    `session_id` Nullable(String),
    `metadata` Nullable(String) CODEC(ZSTD(3)),
    `root_span_id` Nullable(UUID),
    `root_span_name` Nullable(String),
    `root_span_name_fallback` Nullable(String),
    `root_span_type` Nullable(Enum8('DEFAULT' = 0, 'LLM' = 1, 'PIPELINE' = 2, 'EXECUTOR' = 3,
        'EVALUATOR' = 4, 'EVALUATION' = 5, 'TOOL' = 6, 'HUMAN_EVALUATOR' = 7, 'CACHED' = 8)),
    `status` Nullable(Enum8('success' = 1, 'error' = 2)),
    `has_browser_session` Nullable(UInt8),
    `trace_type` Nullable(Enum8('DEFAULT' = 0, 'EVALUATION' = 1, 'EVENT' = 2, 'PLAYGROUND' = 3)),
    -- reserved, no writer yet
    `internal_metadata` Nullable(String) CODEC(ZSTD(3)),
    INDEX traces_static_session_id_idx session_id TYPE bloom_filter,
    INDEX traces_static_user_id_idx user_id TYPE bloom_filter,
    PROJECTION p_start_time
    (
        SELECT *
        ORDER BY project_id, start_time, trace_id
    )
)
ENGINE = CoalescingMergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (project_id, trace_id)
SETTINGS index_granularity = 8192, deduplicate_merge_projection_mode = 'rebuild';
