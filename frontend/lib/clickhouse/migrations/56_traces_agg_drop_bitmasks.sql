-- LAM-1983 cleanup: bitmask columns superseded by the `statuses`/`trace_types`
-- enum arrays (migration 55). Writes stopped with the same release; cloud data
-- was converted by a one-off ALTER UPDATE outside the codebase.
ALTER TABLE default.traces_agg
    DROP COLUMN IF EXISTS `status_seen`,
    DROP COLUMN IF EXISTS `trace_type_seen`;
