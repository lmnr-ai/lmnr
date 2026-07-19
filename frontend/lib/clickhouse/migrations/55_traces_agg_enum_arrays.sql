-- LAM-1983: replace the status/trace-type bitmasks with seen-value enum arrays.
-- Each partial writes the values observed in its batch; groupUniqArrayArray
-- folds them to a per-trace union, and precedence stays a view-only rule.
-- Enum8 is Int8 on the wire (the Rust writer sends ints; keep the DDL variants
-- in sync with `Into<u8> for TraceType`), while reads accept both string names
-- and ints and JSON formats render names. `status_seen`/`trace_type_seen` stay
-- in place until a later cleanup migration; new code stops writing them.
ALTER TABLE default.traces_agg
    ADD COLUMN IF NOT EXISTS `statuses` SimpleAggregateFunction(groupUniqArrayArray,
        Array(Enum8('success' = 1, 'error' = 2))),
    ADD COLUMN IF NOT EXISTS `trace_types` SimpleAggregateFunction(groupUniqArrayArray,
        Array(Enum8('DEFAULT' = 0, 'EVALUATION' = 1, 'EVENT' = 2, 'PLAYGROUND' = 3)));

-- Time-bound params are load-bearing for correctness, not just pruning: the
-- inner scan must include every partial of a qualifying trace, and the outer
-- re-filter on aggregated min(start_time) drops boundary traces whose partial
-- set was clipped. Callers (query engine) pad the bounds by more than the max
-- trace duration and re-apply the exact user bounds in their own WHERE.
DROP VIEW IF EXISTS default.traces_agg_v0;
CREATE VIEW IF NOT EXISTS default.traces_agg_v0 SQL SECURITY INVOKER AS
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
        length(mapKeys(t.metadata_state)) = 0,
        '',
        concat(
            '{',
            arrayStringConcat(
                arrayMap(
                    kv -> concat(toJSONString(kv.1), ':', substring(kv.2, 22)),
                    arrayZip(mapKeys(t.metadata_state), mapValues(t.metadata_state))
                ),
                ','
            ),
            '}'
        )
    ) AS metadata,
    t.session_id AS session_id,
    t.user_id AS user_id,
    -- no status-bearing spans resolves to 'success', matching traces_v0's two-value contract
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
    -- EVENT deliberately falls through to DEFAULT, matching the bitmask view
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
    t.root_span_input AS root_span_input,
    t.root_span_output AS root_span_output,
    t.agent_input AS agent_input,
    t.agent_output AS agent_output,
    if(length(mapKeys(t.subagent_inputs)) = 0, '', toJSONString(t.subagent_inputs)) AS subagent_inputs,
    if(length(mapKeys(t.subagent_outputs)) = 0, '', toJSONString(t.subagent_outputs)) AS subagent_outputs
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
        maxMap(metadata) AS metadata_state,
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
        max(root_span_input) AS root_span_input,
        max(root_span_output) AS root_span_output,
        max(agent_input) AS agent_input,
        max(agent_output) AS agent_output,
        maxMap(subagent_inputs) AS subagent_inputs,
        maxMap(subagent_outputs) AS subagent_outputs
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
WHERE t.start_time >= {min_start_time:DateTime64(9)}
    AND t.start_time <= {max_start_time:DateTime64(9)};
