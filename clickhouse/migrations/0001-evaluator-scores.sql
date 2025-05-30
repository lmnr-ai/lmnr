CREATE TABLE default.evaluator_scores
(
    `id` UUID,
    `span_id` UUID,
    `project_id` UUID,
    `evaluator_id` UUID,
    `score` Float64,
    `created_at` DateTime64(9, 'UTC')
)
ENGINE = MergeTree()
PRIMARY KEY (project_id, evaluator_id)
ORDER BY (project_id, evaluator_id, created_at)
SETTINGS index_granularity = 8192;
