-- Release v0.1.27: Introduction of traces_replacing table
-- Historical data migration script that needs to be manually applied.
--
-- Instructions:
-- 1. Execute clickhouse-client on the target ClickHouse server.
--    - For docker based deployments: `docker exec -it clickhouse clickhouse-client`
-- 2. Edit the project_id to the one you want to migrate, and optionally set the start_time and end_time.
-- 3. Copy and paste the script into the clickhouse-client terminal.
-- 4. Execute the script by pressing Enter.

INSERT INTO default.traces_replacing (
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
    status,
    top_span_id,
    top_span_name,
    top_span_type,
    trace_type,
    tags,
    has_browser_session,
    num_spans,
    id,
    project_id
)
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
    CASE WHEN countIf(spans.status = 'error') > 0 THEN 'error' ELSE 'success' END AS status,
    anyIf(span_id, parent_span_id='00000000-0000-0000-0000-000000000000') AS top_span_id,
    anyIf(name, parent_span_id='00000000-0000-0000-0000-000000000000') AS top_span_name,
    anyIf(span_type, parent_span_id='00000000-0000-0000-0000-000000000000') AS top_span_type,
    CASE WHEN countIf(span_type IN (3, 4, 5)) > 0 THEN 1 ELSE 0 END AS trace_type,
    arrayDistinct(arrayFlatten(arrayConcat(groupArray(tags_array)))) AS tags,
    any(simpleJSONExtractBool(attributes, 'lmnr.internal.has_browser_session')) AS has_browser_session,
    count(*) AS num_spans,
    trace_id id,
    project_id
FROM spans
WHERE project_id={project_id:UUID} -- TODO: set your project_id
AND spans.start_time>= '2025-01-01' -- optional: set your start_time
AND spans.start_time<=now64(9)-- optional: set your end_time
GROUP BY id, project_id;
