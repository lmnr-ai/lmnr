CREATE VIEW IF NOT EXISTS traces_v0 SQL SECURITY INVOKER AS
    SELECT
        MIN(spans.start_time) AS start_time,
        MAX(spans.end_time) AS end_time,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(total_tokens) AS total_tokens,
        SUM(input_cost) AS input_cost,
        SUM(output_cost) AS output_cost,
        SUM(total_cost) AS total_cost,
        MAX(spans.end_time) - MIN(spans.start_time) AS duration,
        argMax(trace_metadata, length(trace_metadata)) AS metadata,
        anyIf(session_id, session_id != '<null>' AND session_id != '') AS session_id,
        anyIf(user_id, user_id != '<null>' AND user_id != '') AS user_id,
        anyIf(status, status != '<null>' AND status != '') AS status,
        anyIf(span_id, parent_span_id='00000000-0000-0000-0000-000000000000') AS top_span_id,
        anyIf(name, parent_span_id='00000000-0000-0000-0000-000000000000') AS top_span_name,
        CASE WHEN countIf(span_type IN (3, 4, 5)) > 0 THEN 'EVALUATION' ELSE 'DEFAULT' END AS trace_type,
        trace_id id
    FROM spans
    WHERE project_id={project_id:UUID} AND spans.start_time>={start_time:DateTime64} AND spans.start_time<={end_time:DateTime64}
    GROUP BY id, project_id;

CREATE VIEW IF NOT EXISTS spans_v0 SQL SECURITY INVOKER AS
    SELECT
        span_id,
        name,
        CASE
            WHEN span_type = 0 THEN 'DEFAULT'
            WHEN span_type = 1 THEN 'LLM'
            WHEN span_type = 3 THEN 'EXECUTOR'
            WHEN span_type = 4 THEN 'EVALUATOR'
            WHEN span_type = 5 THEN 'EVALUATION'
            WHEN span_type = 6 THEN 'TOOL'
            WHEN span_type = 7 THEN 'HUMAN_EVALUATOR'
            WHEN span_type = 8 THEN 'EVENT'
            ELSE 'UNKNOWN'
         END AS span_type,
         start_time,
         end_time,
         end_time - start_time AS duration,
         input_cost,
         output_cost,
         total_cost,
         input_tokens,
         output_tokens,
         total_tokens,
         request_model,
         response_model,
         model,
         trace_id,
         provider,
         path,
         input,
         output,
         status,
         parent_span_id,
         attributes,
         tags
    FROM spans
    WHERE project_id={project_id:UUID};

CREATE VIEW IF NOT EXISTS dataset_datapoints_v0 SQL SECURITY INVOKER AS
    SELECT
        id,
        dataset_id,
        data,
        target,
        metadata
    FROM dataset_datapoints
    WHERE project_id={project_id:UUID};

CREATE VIEW IF NOT EXISTS dataset_datapoints_v0 SQL SECURITY INVOKER AS
    SELECT
        id,
        dataset_id,
        data,
        target,
        metadata
    FROM dataset_datapoints
    WHERE project_id={project_id:UUID};

CREATE VIEW IF NOT EXISTS map_aggregate_evaluation_scores_v0 SQL SECURITY INVOKER AS
    SELECT
        project_id,
        evaluation_id,
        evaluation_scores.evaluation_datapoint_id,
        any(group_id) group_id,
        toJSONString(mapFromArrays(groupArray(name), groupArray(value))) scores
    FROM evaluation_scores
    WHERE project_id={project_id:UUID}
    GROUP BY project_id, evaluation_id, evaluation_datapoint_id;

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
        toJSONString(es.scores) scores,
        es.scores scores_map,
        ed.created_at created_at
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

CREATE VIEW IF NOT EXISTS events_v0 SQL SECURITY INVOKER AS
    SELECT
        id,
        span_id,
        name,
        timestamp,
        attributes,
        user_id,
        session_id,
        trace_id
    FROM events
    WHERE project_id={project_id:UUID};

CREATE VIEW IF NOT EXISTS tags_v0 SQL SECURITY INVOKER AS
    SELECT
        id,
        span_id,
        name,
        created_at,
        CASE
            WHEN source = 0 THEN 'HUMAN'
            WHEN span_type = 2 THEN 'CODE'
            ELSE 'UNKNOWN'
        END source
    FROM tags
    WHERE project_id={project_id:UUID};
