ALTER TABLE default.traces_replacing ADD COLUMN IF NOT EXISTS `span_names` Array(String) DEFAULT [];

DROP VIEW IF EXISTS default.raw_traces_v0;
CREATE VIEW IF NOT EXISTS default.raw_traces_v0 SQL SECURITY INVOKER AS
SELECT
    start_time,
    end_time,
    input_tokens,
    output_tokens,
    total_tokens,
    input_cost,
    output_cost,
    total_cost,
    duration,
    metadata,
    session_id,
    user_id,
    CASE
        WHEN status = 'error' THEN 'error'
        ELSE 'success'
    END AS status,
    top_span_id,
    top_span_name,
    CASE
        WHEN top_span_type = 0 THEN 'DEFAULT'
        WHEN top_span_type = 1 THEN 'LLM'
        WHEN top_span_type = 3 THEN 'EXECUTOR'
        WHEN top_span_type = 4 THEN 'EVALUATOR'
        WHEN top_span_type = 5 THEN 'EVALUATION'
        WHEN top_span_type = 6 THEN 'TOOL'
        WHEN top_span_type = 7 THEN 'HUMAN_EVALUATOR'
        WHEN top_span_type = 8 THEN 'CACHED'
        ELSE 'UNKNOWN'
    END AS top_span_type,
    CASE
      WHEN trace_type = 3 THEN 'PLAYGROUND'
      WHEN trace_type = 1 THEN 'EVALUATION'
      WHEN trace_type = 0 THEN 'DEFAULT'
      ELSE 'DEFAULT'
    END AS trace_type,
    arrayDistinct(tags) tags,
    has_browser_session,
    arrayDistinct(span_names) span_names,
    id,
    project_id
FROM default.traces_replacing FINAL
WHERE project_id={project_id:UUID};

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
    t.top_span_id as top_span_id,
    t.top_span_name AS top_span_name,
    t.top_span_type AS top_span_type,
    t.trace_type AS trace_type,
    t.tags AS tags,
    t.has_browser_session AS has_browser_session,
    t.id AS id,
    t.span_names AS span_names
FROM
    default.raw_traces_v0(project_id={project_id:UUID}) t
WHERE t.project_id={project_id:UUID};