CREATE TABLE new_evaluation_datapoints (
    id UUID,
    evaluation_id UUID,
    project_id UUID,
    trace_id UUID,
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
ORDER BY (project_id, evaluation_id, index, id)
SETTINGS index_granularity = 8192;

-- Move existing data, similar to the views
INSERT INTO new_evaluation_datapoints (
    id,
    evaluation_id,
    project_id,
    trace_id,
    updated_at,
    data,
    target,
    metadata,
    executor_output,
    index,
    dataset_id,
    dataset_datapoint_id,
    dataset_datapoint_created_at,
    group_id,
    scores
)
WITH map_aggregate_evaluation_scores AS (
    SELECT
        project_id,
        evaluation_id,
        evaluation_scores.evaluation_datapoint_id,
        any(group_id) group_id,
        toJSONString(mapFromArrays(groupArray(name), groupArray(value))) scores
    FROM evaluation_scores
    GROUP BY project_id, evaluation_id, evaluation_datapoint_id
)
SELECT ed.id id,
        ed.evaluation_id evaluation_id,
        ed.project_id project_id,
        ed.trace_id trace_id,
        ed.created_at updated_at,
        ed.data data,
        ed.target target,
        ed.metadata metadata,
        edo.executor_output executor_output,
        ed.index index,
        ed.dataset_id dataset_id,
        ed.dataset_datapoint_id dataset_datapoint_id,
        ed.dataset_datapoint_created_at dataset_datapoint_created_at,
        ifNull(es.group_id, 'default') group_id,
        ifNull(es.scores, '{}') scores
    FROM evaluation_datapoints ed
    LEFT JOIN map_aggregate_evaluation_scores es
        ON ed.project_id = es.project_id
        AND ed.evaluation_id = es.evaluation_id
        AND ed.id = es.evaluation_datapoint_id
    LEFT JOIN evaluation_datapoint_executor_outputs edo
        ON ed.project_id = edo.project_id
        AND ed.evaluation_id = edo.evaluation_id
        AND ed.id = edo.evaluation_datapoint_id
        AND ed.index = edo.index;

-- Rename the table
RENAME TABLE evaluation_datapoints TO old_evaluation_datapoints;
RENAME TABLE new_evaluation_datapoints TO evaluation_datapoints;

-- Drop the old table
DROP TABLE IF EXISTS old_evaluation_datapoints;

-- Drop the view
DROP VIEW IF EXISTS evaluation_datapoints_v0;
DROP VIEW IF EXISTS map_aggregate_evaluation_scores_v0;

-- Create new simpler view
CREATE VIEW IF NOT EXISTS evaluation_datapoints_v0 SQL SECURITY INVOKER AS
    SELECT
        id,
        evaluation_id,
        data,
        target,
        metadata,
        executor_output,
        index,
        trace_id,
        group_id,
        scores,
        updated_at,
        dataset_id,
        dataset_datapoint_id,
        dataset_datapoint_created_at,
        -- backwards compatibility
        updated_at as created_at
FROM evaluation_datapoints FINAL
WHERE project_id={project_id:UUID};
