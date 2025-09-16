CREATE TABLE IF NOT EXISTS default.evaluator_scores
(
    `id` UUID,
    `span_id` UUID,
    `project_id` UUID,
    `name` String,
    `source` UInt8,
    `evaluator_id` UUID default '00000000-0000-0000-0000-000000000000',
    `score` Float64,
    `created_at` DateTime64(9, 'UTC')
)
ENGINE = MergeTree()
ORDER BY (project_id, name, created_at)
SETTINGS index_granularity = 8192;
