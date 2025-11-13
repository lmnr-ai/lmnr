ALTER TABLE evaluation_datapoints ADD COLUMN IF NOT EXISTS dataset_id UUID;
ALTER TABLE evaluation_datapoints ADD COLUMN IF NOT EXISTS dataset_datapoint_id UUID;
ALTER TABLE evaluation_datapoints ADD COLUMN IF NOT EXISTS dataset_datapoint_created_at DateTime64(9, 'UTC');

DROP VIEW IF EXISTS evaluation_datapoints_v0;
CREATE VIEW IF NOT EXISTS evaluation_datapoints_v0 SQL SECURITY INVOKER AS
    SELECT
        ed.id id,
        ed.evaluation_id evaluation_id,
        ed.data data,
        ed.target target,
        ed.metadata metadata,
        edo.executor_output executor_output,
        ed.index index,
        ed.trace_id trace_id,
        es.group_id group_id,
        es.scores scores,
        ed.created_at created_at,
        ed.dataset_id dataset_id,
        ed.dataset_datapoint_id dataset_datapoint_id,
        ed.dataset_datapoint_created_at dataset_datapoint_created_at
    FROM evaluation_datapoints ed
    LEFT JOIN map_aggregate_evaluation_scores_v0(project_id={project_id:UUID}) es
        ON ed.project_id = es.project_id
        AND ed.evaluation_id = es.evaluation_id
        AND ed.id = es.evaluation_datapoint_id
    LEFT JOIN evaluation_datapoint_executor_outputs edo
        ON ed.project_id = edo.project_id
        AND ed.evaluation_id = edo.evaluation_id
        AND ed.id = edo.evaluation_datapoint_id
        AND ed.index = edo.index
    WHERE ed.project_id={project_id:UUID};
