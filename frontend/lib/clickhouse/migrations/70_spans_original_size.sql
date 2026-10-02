-- `original_size_bytes` (LAM-2330): the span's size as if no content
-- dedup ran, i.e. `size_bytes` with input, output and tool definitions
-- counted at their raw JSON size instead of hashes + newly-stored content.
-- `created_at` is server-assigned; app-server never writes it. Rows in parts
-- written before this migration have no stored value, so ClickHouse evaluates
-- the DEFAULT at read time and they report the query's `now64(9)`.
--
-- Neither column is exposed through `spans_v0` / `spans_v1`, same as
-- `size_bytes`, and neither is added to the `spans_no_io_by_start_time`
-- PROJECTION (rebuilding it would rewrite the whole table).
ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS original_size_bytes UInt64;

ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS created_at DateTime64(9, 'UTC') DEFAULT now64(9);
