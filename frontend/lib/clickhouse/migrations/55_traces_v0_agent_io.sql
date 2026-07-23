-- Repoint traces_v0 at the aggregating traces_agg table so `FROM traces` reads
-- surface the ingestion-time-extracted agent_input / agent_output columns
-- (replacing root_span_input / root_span_output). Same 3 params as before, so the
-- query engine's project_id + start_time injection is unchanged. Body mirrors
-- traces_agg_v0 (migration 54).
DROP VIEW IF EXISTS default.traces_v0;
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
    (toUnixTimestamp64Nano(t.end_time) - toUnixTimestamp64Nano(t.start_time)) / 1000000000 AS duration,
    if(
        length(mapKeys(t.metadata)) = 0,
        '',
        concat(
            '{',
            arrayStringConcat(
                arrayMap(
                    (k, v) -> concat(toJSONString(k), ':', v),
                    mapKeys(t.metadata), mapValues(t.metadata)
                ),
                ','
            ),
            '}'
        )
    ) AS metadata,
    t.session_id AS session_id,
    t.user_id AS user_id,
    if(has(t.statuses, 'error'), 'error', 'success') AS status,
    t.top_span_id AS top_span_id,
    substring(t.top_span_name, 2) AS top_span_name,
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
    multiIf(
        has(t.trace_types, 'PLAYGROUND'), 'PLAYGROUND',
        has(t.trace_types, 'EVALUATION'), 'EVALUATION',
        'DEFAULT'
    ) AS trace_type,
    t.tags AS tags,
    tt.tags AS trace_tags,
    toBool(t.has_browser_session) AS has_browser_session,
    t.id AS id,
    t.span_names AS span_names,
    if(
        length(mapKeys(t.internal_metadata)) = 0,
        '',
        concat(
            '{',
            arrayStringConcat(
                arrayMap(
                    (k, v) -> concat(toJSONString(k), ':', v),
                    mapKeys(t.internal_metadata), mapValues(t.internal_metadata)
                ),
                ','
            ),
            '}'
        )
    ) AS internal_metadata,
    ifNull(ai.value, '') AS agent_input,
    ifNull(ao.value, '') AS agent_output
FROM (
    SELECT
        project_id,
        id,
        min(start_time) AS start_time,
        max(end_time) AS end_time,
        sum(input_tokens) AS input_tokens,
        sum(output_tokens) AS output_tokens,
        sum(total_tokens) AS total_tokens,
        sum(cache_read_input_tokens) AS cache_read_input_tokens,
        sum(cache_creation_input_tokens) AS cache_creation_input_tokens,
        sum(reasoning_tokens) AS reasoning_tokens,
        sum(input_cost) AS input_cost,
        sum(output_cost) AS output_cost,
        sum(total_cost) AS total_cost,
        maxMap(metadata) AS metadata,
        max(session_id) AS session_id,
        max(user_id) AS user_id,
        groupUniqArrayArray(statuses) AS statuses,
        max(top_span_id) AS top_span_id,
        max(top_span_name) AS top_span_name,
        max(top_span_type) AS top_span_type,
        groupUniqArrayArray(trace_types) AS trace_types,
        groupUniqArrayArray(tags) AS tags,
        max(has_browser_session) AS has_browser_session,
        groupUniqArrayArray(span_names) AS span_names,
        maxMap(internal_metadata) AS internal_metadata
    FROM (
        SELECT *
        FROM default.traces_agg
        WHERE project_id = {project_id:UUID}
            AND start_time >= {min_start_time:DateTime64(9)}
            AND start_time <= {max_start_time:DateTime64(9)}
    )
    GROUP BY project_id, id
) AS t
LEFT JOIN (
    SELECT * FROM default.trace_tags FINAL WHERE project_id = {project_id:UUID}
) AS tt
    ON t.project_id = tt.project_id AND t.id = tt.trace_id
LEFT JOIN (
    SELECT * FROM default.trace_agent_input FINAL WHERE project_id = {project_id:UUID}
) AS ai
    ON t.project_id = ai.project_id AND t.id = ai.trace_id
LEFT JOIN (
    SELECT * FROM default.trace_agent_output FINAL WHERE project_id = {project_id:UUID}
) AS ao
    ON t.project_id = ao.project_id AND t.id = ao.trace_id
WHERE t.start_time >= {min_start_time:DateTime64(9)}
    AND t.start_time <= {max_start_time:DateTime64(9)};
