DROP VIEW IF EXISTS default.traces_v0;
CREATE VIEW IF NOT EXISTS default.traces_v0 SQL SECURITY INVOKER AS
SELECT
    t.start_time AS start_time,
    t.end_time AS end_time,
    t.input_tokens AS input_tokens,
    t.output_tokens AS output_tokens,
    t.total_tokens AS total_tokens,
    t.input_cost AS input_cost,
    t.output_cost AS output_cost,
    t.total_cost AS total_cost,
    t.duration AS duration,
    t.metadata AS metadata,
    t.session_id AS session_id,
    t.user_id AS user_id,
    t.status AS status,
    t.top_span_id AS top_span_id,
    t.top_span_name AS top_span_name,
    t.top_span_type AS top_span_type,
    t.trace_type AS trace_type,
    t.tags AS tags,
    t.has_browser_session AS has_browser_session,
    t.id AS id,
    t.span_names AS span_names,
    rs.root_span_input AS root_span_input,
    rs.root_span_output AS root_span_output
FROM
    default.raw_traces_v0(project_id={project_id:UUID}) t
ANY LEFT JOIN (
    SELECT
        trace_id,
        span_id,
        substring(input, 1, 200) AS root_span_input,
        substring(output, 1, 200) AS root_span_output
    FROM default.spans
    WHERE project_id = {project_id:UUID}
      AND parent_span_id = '00000000-0000-0000-0000-000000000000'
) rs ON rs.trace_id = t.id AND rs.span_id = t.top_span_id
WHERE t.project_id={project_id:UUID};
