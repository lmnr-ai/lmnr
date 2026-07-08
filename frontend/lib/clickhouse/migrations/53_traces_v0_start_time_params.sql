-- Collapse raw_traces_v0 into a single parameterized traces_v0 view. The new
-- view takes min_start_time / max_start_time and pushes them (plus project_id)
-- into a PREWHERE on the traces_replacing scan, so the start_time range narrows
-- the granules read BEFORE FINAL dedups/merges. The query engine defaults these
-- params (broad epoch bounds when the user query has no time filter, padded
-- ±3h around the user's filter otherwise) so no caller ever omits them.
DROP VIEW IF EXISTS default.traces_v0;
DROP VIEW IF EXISTS default.raw_traces_v0;

CREATE VIEW IF NOT EXISTS default.traces_v0 SQL SECURITY INVOKER AS
SELECT
    t.start_time AS start_time,
    t.end_time AS end_time,
    t.input_tokens AS input_tokens,
    t.output_tokens AS output_tokens,
    t.total_tokens AS total_tokens,
    t.cache_read_input_tokens AS cache_read_input_tokens,
    t.cache_creation_input_tokens AS cache_creation_input_tokens,
    t.reasoning_tokens AS reasoning_tokens,
    t.input_cost AS input_cost,
    t.output_cost AS output_cost,
    t.total_cost AS total_cost,
    t.duration AS duration,
    t.metadata AS metadata,
    t.session_id AS session_id,
    t.user_id AS user_id,
    CASE WHEN t.status = 'error' THEN 'error' ELSE 'success' END AS status,
    t.top_span_id AS top_span_id,
    t.top_span_name AS top_span_name,
    CASE
        WHEN t.top_span_type = 0 THEN 'DEFAULT'
        WHEN t.top_span_type = 1 THEN 'LLM'
        WHEN t.top_span_type = 3 THEN 'EXECUTOR'
        WHEN t.top_span_type = 4 THEN 'EVALUATOR'
        WHEN t.top_span_type = 5 THEN 'EVALUATION'
        WHEN t.top_span_type = 6 THEN 'TOOL'
        WHEN t.top_span_type = 7 THEN 'HUMAN_EVALUATOR'
        WHEN t.top_span_type = 8 THEN 'CACHED'
        ELSE 'UNKNOWN'
    END AS top_span_type,
    CASE
        WHEN t.trace_type = 3 THEN 'PLAYGROUND'
        WHEN t.trace_type = 1 THEN 'EVALUATION'
        WHEN t.trace_type = 0 THEN 'DEFAULT'
        ELSE 'DEFAULT'
    END AS trace_type,
    arrayDistinct(t.tags) AS tags,
    tt.tags AS trace_tags,
    t.has_browser_session AS has_browser_session,
    t.id AS id,
    arrayDistinct(t.span_names) AS span_names,
    t.root_span_input AS root_span_input,
    t.root_span_output AS root_span_output
FROM (
    SELECT * FROM default.traces_replacing FINAL
    PREWHERE project_id = {project_id:UUID}
        AND start_time >= {min_start_time:DateTime64(9)}
        AND start_time <= {max_start_time:DateTime64(9)}
) AS t
LEFT JOIN (
    SELECT * FROM default.trace_tags FINAL WHERE project_id = {project_id:UUID}
) AS tt
    ON t.project_id = tt.project_id AND t.id = tt.trace_id;
