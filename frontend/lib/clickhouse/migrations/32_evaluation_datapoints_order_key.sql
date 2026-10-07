CREATE TABLE IF NOT EXISTS new_evaluation_datapoints
(
    `id` UUID,
    `evaluation_id` UUID,
    `project_id` UUID,
    `trace_id` UUID,
    `updated_at` DateTime64(9, 'UTC'),
    `data` String CODEC(ZSTD(3)),
    `target` String CODEC(ZSTD(3)),
    `metadata` String CODEC(ZSTD(3)),
    `executor_output` String CODEC(ZSTD(3)),
    `index` UInt64,
    `dataset_id` UUID,
    `dataset_datapoint_id` UUID,
    `dataset_datapoint_created_at` DateTime64(9, 'UTC'),
    `group_id` String,
    `scores` String
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, evaluation_id, id);

INSERT INTO new_evaluation_datapoints SELECT * FROM evaluation_datapoints;

RENAME TABLE evaluation_datapoints TO old_evaluation_datapoints;
RENAME TABLE new_evaluation_datapoints TO evaluation_datapoints;

DROP TABLE IF EXISTS old_evaluation_datapoints;
