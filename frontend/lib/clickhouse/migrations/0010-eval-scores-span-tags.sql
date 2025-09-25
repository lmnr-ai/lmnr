ALTER TABLE spans ADD COLUMN IF NOT EXISTS tags_array Array(String) DEFAULT [];

CREATE TABLE IF NOT EXISTS default.evaluation_datapoint_executor_outputs
(
    `evaluation_datapoint_id` UUID,
    `evaluation_id` UUID,
    `project_id` UUID,
    `created_at` DateTime64(9, 'UTC'),
    `executor_output` String CODEC(ZSTD(3)),
    `index` UInt64
)
ENGINE = MergeTree()
ORDER BY (project_id, evaluation_id, `index`)
SETTINGS index_granularity = 8192;

ALTER TABLE evaluation_scores ADD PROJECTION IF NOT EXISTS evaluation_scores_by_eval_projection(
    SELECT * ORDER BY project_id, evaluation_id, evaluation_datapoint_id
);

ALTER TABLE evaluation_scores MATERIALIZE PROJECTION evaluation_scores_by_eval_projection;
