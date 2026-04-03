# Trace Tags Performance Benchmark

## Context

**LAM-1414**: Compare two approaches for storing user-assigned trace-level tags in ClickHouse.

- **Approach 1 (current)**: `trace_tags` is a column directly on `traces_replacing` (ReplacingMergeTree with `num_spans` version column). The `traces_v0` view reads it without any join.
- **Approach 2 (proposed)**: Separate `trace_tags_array_rmt` table with `ReplacingMergeTree(updated_at)`. A new view JOINs `traces_replacing` with `trace_tags_array_rmt` on `(project_id, trace_id)`.

## Test Setup

- **ClickHouse**: ClickHouse Cloud (SharedReplacingMergeTree), us-east-1
- **Dataset**: ~11,651 traces in project `0cce3ee3-...`
- **Tags distribution**: ~40% of traces have 1–4 trace_tags from a pool of 15 distinct tags
- **Methodology**: Each query run 3 times, best ClickHouse-reported elapsed time used

## Read Benchmark Results (11K traces)

| Query | Approach | CH ms | Rows Read | Bytes Read | Result Rows |
|---|---|---|---|---|---|
| Single trace by ID | NoJoin | 34.7 | 11,651 | 2,716,591 | 1 |
| | JOIN | 43.6 | 23,302 | 3,292,001 | 1 |
| | **Ratio** | **1.26x** | **2.00x** | **1.21x** | |
| List 50 traces | NoJoin | 35.4 | 11,651 | 2,716,591 | 50 |
| | JOIN | 44.4 | 23,302 | 3,292,001 | 50 |
| | **Ratio** | **1.26x** | **2.00x** | **1.21x** | |
| List 100 traces | NoJoin | 33.1 | 11,651 | 2,716,591 | 100 |
| | JOIN | 44.3 | 23,302 | 3,292,001 | 100 |
| | **Ratio** | **1.34x** | **2.00x** | **1.21x** | |
| Filter tags=production | NoJoin | 35.9 | 11,651 | 2,716,591 | 50 |
| | JOIN | 44.6 | 23,302 | 3,292,001 | 50 |
| | **Ratio** | **1.24x** | **2.00x** | **1.21x** | |
| Filter 2 tags (AND) | NoJoin | 30.5 | 11,651 | 2,719,250 | 50 |
| | JOIN | 40.0 | 23,302 | 3,294,660 | 50 |
| | **Ratio** | **1.31x** | **2.00x** | **1.21x** | |
| Count per tag | NoJoin | 14.2 | 11,651 | 742,650 | 17 |
| | JOIN | 21.7 | 23,302 | 1,115,482 | 17 |
| | **Ratio** | **1.54x** | **2.00x** | **1.50x** | |
| Aggregate | NoJoin | 13.6 | 11,651 | 652,456 | 1 |
| | JOIN | 20.9 | 23,302 | 1,025,288 | 1 |
| | **Ratio** | **1.54x** | **2.00x** | **1.57x** | |

## Read Benchmark Results (1.6K traces)

| Query | Approach | CH ms | Rows Read | Bytes Read |
|---|---|---|---|---|
| Single trace by ID | NoJoin | 21.8 | 1,651 | 403,147 |
| | JOIN | 29.4 | 3,302 | 485,549 |
| List 50 traces | NoJoin | 22.1 | 1,651 | 403,147 |
| | JOIN | 28.6 | 3,302 | 485,549 |
| Filter tags=production | NoJoin | 23.4 | 1,651 | 403,147 |
| | JOIN | 29.9 | 3,302 | 485,549 |

## Write Benchmark (50-row batch tag updates)

| Metric | Approach 1 (full rewrite) | Approach 2 (tags only) |
|---|---|---|
| Requires read-before-write | Yes (full row) | No |
| Write payload per row | ~356 bytes | ~132 bytes |
| Write latency (50 rows) | ~470ms | ~365ms |
| Payload size ratio | 2.7x larger | 1.0x baseline |

## Analysis

### Reads: Approach 1 wins consistently

- The JOIN approach reads **exactly 2x rows** (both tables are full-scanned per project).
- ClickHouse elapsed time is **25–55% higher** with the JOIN.
- Bytes read are **21–57% higher** depending on query (wider columns = bigger gap for aggregates).
- At this scale the absolute difference is 10–15ms; at 100K+ traces it would grow proportionally.

### Writes: Approach 2 has a modest advantage

- Approach 2 writes ~2.7x less data per tag update (132 vs 356 bytes/row).
- Approach 2 doesn't require reading the existing row first (fire-and-forget insert).
- However, trace tag updates are **infrequent** (user action, not on every span ingestion), so the write advantage matters less than the read overhead.

### Decoupling concern

The rationale for Approach 2 is that `traces_replacing` uses `num_spans` as its version column, so every span ingestion rewrites trace_tags. However:

1. The `trace_tags` column is an `Array(String)` DEFAULT `[]` — it's extremely lightweight (empty arrays compress to near-zero).
2. The Rust code already passes `Vec::<String>::new()` during span ingestion (never overwrites existing tags).
3. ReplacingMergeTree deduplicates on `(project_id, id)` with `num_spans` as version — the row with the highest `num_spans` wins, which always preserves the most recent trace_tags since they're carried forward.
4. The actual tag update path (frontend API → ClickHouse) already does a full row re-insert correctly.

## Recommendation

**Keep Approach 1** (trace_tags as a column on traces_replacing).

Reasons:
1. **Simpler architecture** — no additional table, no JOIN, no data sync concerns.
2. **Better read performance** — every query on the traces view is faster by 25–55%.
3. **Read-heavy workload** — trace listing/filtering is the hot path (every page load), while tag updates are rare user actions.
4. **Write advantage is negligible** — saving ~100 bytes per tag update on an infrequent operation doesn't justify permanently slower reads.
5. **No correctness risk** — the current code correctly preserves trace_tags through span ingestion (empty default, COALESCE on upsert).

The only scenario where Approach 2 would become favorable is if trace_tags needed to be updated at very high frequency (e.g., automated tagging on every span arrival), which is not the current or planned use case.
