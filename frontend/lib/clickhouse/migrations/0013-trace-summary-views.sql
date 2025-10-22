DROP VIEW IF EXISTS traces_v0;
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
        anyIf(spans.status, spans.status != '<null>' AND spans.status != '') AS status,
        anyIf(span_id, parent_span_id='00000000-0000-0000-0000-000000000000') AS top_span_id,
        anyIf(name, parent_span_id='00000000-0000-0000-0000-000000000000') AS top_span_name,
        anyIf(CASE
            WHEN span_type = 0 THEN 'DEFAULT'
            WHEN span_type = 1 THEN 'LLM'
            WHEN span_type = 3 THEN 'EXECUTOR'
            WHEN span_type = 4 THEN 'EVALUATOR'
            WHEN span_type = 5 THEN 'EVALUATION'
            WHEN span_type = 6 THEN 'TOOL'
            WHEN span_type = 7 THEN 'HUMAN_EVALUATOR'
            WHEN span_type = 8 THEN 'EVENT'
            ELSE 'UNKNOWN'
         END, parent_span_id='00000000-0000-0000-0000-000000000000') AS top_span_type,
        CASE WHEN countIf(span_type IN (3, 4, 5)) > 0 THEN 'EVALUATION' ELSE 'DEFAULT' END AS trace_type,
        arrayDistinct(arrayFlatten(arrayConcat(groupArray(tags_array)))) AS tags,
        trace_id id,
        '' as summary,
        '' as analysis_status,
        '' as analysis_preview
    FROM spans
    WHERE project_id={project_id:UUID} AND spans.start_time>={start_time:DateTime64} AND spans.start_time<={end_time:DateTime64}
    GROUP BY id, project_id;
