-- Create separate trace_tags table with ReplacingMergeTree for efficient tag updates
CREATE TABLE IF NOT EXISTS trace_tags
(
    project_id UUID,
    trace_id UUID,
    updated_at DateTime64(6, 'UTC') DEFAULT now64(6),
    tags Array(String)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (project_id, trace_id)
SETTINGS index_granularity = 8192;

-- Drop views in dependency order (traces_v0 depends on raw_traces_v0)
DROP VIEW IF EXISTS default.traces_v0;
DROP VIEW IF EXISTS default.raw_traces_v0;

-- Recreate raw_traces_v0 with LEFT JOIN to trace_tags table
CREATE VIEW IF NOT EXISTS default.raw_traces_v0 SQL SECURITY INVOKER AS
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
    arrayDistinct(t.span_names) AS span_names,
    t.root_span_input AS root_span_input,
    t.root_span_output AS root_span_output,
    t.id AS id,
    t.project_id AS project_id
FROM (SELECT * FROM default.traces_replacing FINAL WHERE project_id={project_id:UUID}) AS t
LEFT JOIN (SELECT * FROM default.trace_tags FINAL WHERE project_id={project_id:UUID}) AS tt
    ON t.project_id = tt.project_id AND t.id = tt.trace_id;

-- Recreate traces_v0 on top of the new raw_traces_v0
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
    t.trace_tags AS trace_tags,
    t.has_browser_session AS has_browser_session,
    t.id AS id,
    t.span_names AS span_names,
    t.root_span_input AS root_span_input,
    t.root_span_output AS root_span_output
FROM
    default.raw_traces_v0(project_id={project_id:UUID}) t
WHERE t.project_id={project_id:UUID};
