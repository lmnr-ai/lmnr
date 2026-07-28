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
-- Writes are per-batch DELTAS — the same model as traces_agg, and independent of
-- the Postgres aggregator (which is being retired). Nothing here reads a
-- cumulative row first, so every column must fold correctly from partials alone.
--
-- `metadata` has SET semantics, NOT patch semantics. It is a plain
-- Nullable(String) holding the whole stringified JSON object (same shape as
-- traces_replacing.metadata), written ONLY when a batch actually carries
-- metadata, and left NULL otherwise. Deliberately NOT a
-- SimpleAggregateFunction(maxMap, Map(...)) like traces_agg: per-key map merging
-- is slow at scale, and escaping that cost is one of the main reasons this table
-- is split out in the first place.
--
-- KNOWN CAVEAT, opted into for that performance win: because writes are deltas
-- and coalescing is "last non-NULL wins" by insertion order, **a trace whose
-- metadata is set more than once has UNDEFINED metadata** — whichever write
-- lands last wins, and keys from the other writes are lost, not merged. Any
-- single write wins wholesale. In practice metadata is set once per trace (the
-- SDK sends it with the trace, and POST /v1/traces/metadata is a set, not a
-- patch), so treat multi-write metadata as unsupported rather than merged.
--
-- `start_time` is the batch's min span start, mirroring traces_replacing /
-- traces_agg so reads can push a PREWHERE down to it. It's the partition key,
-- and a partition-key column is NOT aggregated or coalesced in a
-- CoalescingMergeTree — it keeps the FIRST-ARRIVING value (verified; this
-- differs from AggregatingMergeTree, where traces_agg's identical
-- min/PARTITION BY pairing does fold to the true min). So this can be a later
-- batch's start rather than the trace's true minimum when spans arrive out of
-- order. Deliberately accepted: it's a plain DateTime64 (no misleading
-- SimpleAggregateFunction(min) wrapper, which would silently do nothing here),
-- reads treat it as a pruning bound with padded windows, and the authoritative
-- trace start_time lives in traces_agg.
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
-- `root_span_name` vs `root_span_name_from_path`: the real root span's name and
-- the span-path-derived preview name are SEPARATE columns, and the read path
-- resolves `coalesce(root_span_name, root_span_name_from_path)`. The fallback
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
-- `status` / `trace_type` are deliberately ABSENT here: they stay in traces_agg
-- as its `statuses` / `trace_types` seen-value arrays. Their precedence can't be
-- expressed by last-write-wins over deltas ('error' is sticky, so a later
-- success-only batch must not downgrade it; trace_type DEFAULT must not pin a
-- trace a later batch types as EVALUATION/PLAYGROUND), which needs the union —
-- and traces_agg already stores it and already resolves both in its view. Don't
-- duplicate them here; read them from traces_agg.
--
-- GOTCHA that still applies to `root_span_type`: Enum8 is Int8 on the wire and
-- out-of-range INTS are accepted at INSERT but then poison every later read of
-- the part with UNKNOWN_ELEMENT_OF_ENUM (string inserts validate, int inserts
-- don't). So the enum lists PIPELINE = 2 even though no view surfaces it —
-- SpanType::Pipeline = 2 is reachable, so the enum must cover the full
-- `Into<u8> for SpanType` range. ALTER it in the same PR as any SpanType change.
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
    -- SET semantics: whole stringified JSON object, written only when non-empty.
    -- Setting it more than once per trace is undefined (see the header).
    `metadata` Nullable(String) CODEC(ZSTD(3)),
    `root_span_id` Nullable(UUID),
    `root_span_name` Nullable(String),
    `root_span_name_from_path` Nullable(String),
    `root_span_type` Nullable(Enum8('DEFAULT' = 0, 'LLM' = 1, 'PIPELINE' = 2, 'EXECUTOR' = 3,
        'EVALUATOR' = 4, 'EVALUATION' = 5, 'TOOL' = 6, 'HUMAN_EVALUATOR' = 7, 'CACHED' = 8)),
    `has_browser_session` Nullable(UInt8),
    -- reserved, no writer yet; same SET semantics as `metadata`
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
