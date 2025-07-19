CREATE TABLE IF NOT EXISTS default.datapoints
(
    `id` UUID,
    `dataset_id` UUID,
    `dataset_name` String,
    `project_id` UUID,
    `created_at` DateTime64(9, 'UTC'),
    `data` String CODEC(ZSTD(3)),
    `target` String CODEC(ZSTD(3)),
    `metadata` String CODEC(ZSTD(3))
)
ENGINE = MergeTree()
ORDER BY (project_id, dataset_id, dataset_name, created_at)
SETTINGS index_granularity = 8192; 