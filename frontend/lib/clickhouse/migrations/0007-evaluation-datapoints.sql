CREATE TABLE IF NOT EXISTS default.evaluation_datapoints
(
    `id` UUID,
    `evaluation_id` UUID,
    `project_id` UUID,
    `trace_id` UUID,
    `created_at` DateTime64(9, 'UTC'),
    `data` String CODEC(ZSTD(3)),
    `target` String CODEC(ZSTD(3)),
    `metadata` String CODEC(ZSTD(3))
    `index` UInt64
)
ENGINE = MergeTree()
ORDER BY (project_id, evaluation_id, `index`)
SETTINGS index_granularity = 8192; 