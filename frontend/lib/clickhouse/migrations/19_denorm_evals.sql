CREATE TABLE new_evaluation_datapoints (
    id UUID,
    evaluation_id UUID,
    project_id UUID,
    trace_id UUID,
    created_at DateTime64(9, 'UTC'),
    updated_at DateTime64(9, 'UTC'),
    `data` String CODEC(ZSTD(3)),
    `target` String CODEC(ZSTD(3)),
    metadata String CODEC(ZSTD(3)),
    executor_output String CODEC(ZSTD(3)),
    `index` UInt64,
    dataset_id UUID,
    dataset_datapoint_id UUID,
    dataset_datapoint_created_at DateTime64(9, 'UTC'),
    group_id String,
    scores String,

    INDEX idx_project_eval_id_datapoint_id (project_id, evaluation_id, id) TYPE bloom_filter
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, evaluation_id, index)
SETTINGS index_granularity = 8192;
