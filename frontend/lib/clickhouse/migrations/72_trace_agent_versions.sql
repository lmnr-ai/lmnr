-- Agent versions per trace (agent versioning / checkpoints). Each element is
-- (agent_hash, version_hash, model); `version_hash` keys Postgres
-- `agent_versions`. Written as zero-sum partials by the checkpoints recorder,
-- one per first sighting of a tuple in a trace, so the set unions across them.

ALTER TABLE traces_agg ADD COLUMN IF NOT EXISTS agent_versions
    SimpleAggregateFunction(groupUniqArrayArray, Array(Tuple(
        agent_hash String,
        version_hash String,
        model String
    ))) CODEC(ZSTD(3));

DROP VIEW IF EXISTS traces_v0;
CREATE VIEW IF NOT EXISTS traces_v0 SQL SECURITY INVOKER AS
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
    ifNull(ts.metadata, '') AS metadata,
    ifNull(ts.session_id, '') AS session_id,
    ifNull(ts.user_id, '') AS user_id,
    if(has(t.statuses, 'error'), 'error', 'success') AS status,
    ifNull(ts.root_span_id, toUUID('00000000-0000-0000-0000-000000000000')) AS top_span_id,
    ifNull(coalesce(ts.root_span_name, ts.root_span_name_from_path), '') AS top_span_name,
    CASE
        WHEN ts.root_span_type IS NULL THEN 'DEFAULT'
        WHEN ts.root_span_type = 'DEFAULT' THEN 'DEFAULT'
        WHEN ts.root_span_type = 'LLM' THEN 'LLM'
        WHEN ts.root_span_type = 'EXECUTOR' THEN 'EXECUTOR'
        WHEN ts.root_span_type = 'EVALUATOR' THEN 'EVALUATOR'
        WHEN ts.root_span_type = 'EVALUATION' THEN 'EVALUATION'
        WHEN ts.root_span_type = 'TOOL' THEN 'TOOL'
        WHEN ts.root_span_type = 'HUMAN_EVALUATOR' THEN 'HUMAN_EVALUATOR'
        WHEN ts.root_span_type = 'CACHED' THEN 'CACHED'
        ELSE 'UNKNOWN'
    END AS top_span_type,
    multiIf(
        has(t.trace_types, 'PLAYGROUND'), 'PLAYGROUND',
        has(t.trace_types, 'EVALUATION'), 'EVALUATION',
        'DEFAULT'
    ) AS trace_type,
    t.tags AS tags,
    tt.tags AS trace_tags,
    toBool(ifNull(ts.has_browser_session, 0)) AS has_browser_session,
    t.id AS id,
    t.span_names AS span_names,
    ifNull(ts.internal_metadata, '') AS internal_metadata,
    ifNull(ts.input, '') AS agent_input,
    -- Unsorted, and with no derived signal_ids/signal_severities, on purpose:
    -- an arraySort or a derived column here reads every tuple element including
    -- payload. See docs/internal/clickhouse-traces.md.
    t.signal_events AS signal_events,
    -- The CAST is what names the tuple elements: aliases inside tuple() are
    -- dropped, leaving positional .1/.2 access.
    CAST(arrayMap(
        cluster_id -> tuple(
            cluster_id,
            dictGetOrDefault('clusters_dict', 'signal_id', (t.project_id, cluster_id), toUUID('00000000-0000-0000-0000-000000000000')),
            dictGetOrDefault('clusters_dict', 'name', (t.project_id, cluster_id), ''),
            dictGetOrDefault('clusters_dict', 'level', (t.project_id, cluster_id), toUInt8(0)),
            dictGetOrDefault('clusters_dict', 'parent_id', (t.project_id, cluster_id), toUUID('00000000-0000-0000-0000-000000000000')),
            dictGetOrDefault('clusters_dict', 'num_signal_events', (t.project_id, cluster_id), toUInt32(0)),
            dictGetOrDefault('clusters_dict', 'created_at', (t.project_id, cluster_id), toDateTime64(0, 9, 'UTC')),
            dictGetOrDefault('clusters_dict', 'updated_at', (t.project_id, cluster_id), toDateTime64(0, 9, 'UTC'))
        ),
        -- `path` stays INTERNAL: it is what turns the trace's leaf-only
        -- `cluster_ids` into leaf + ancestors. It is deliberately not a field of
        -- the tuple below -- callers get the ancestors as their own elements of
        -- `clusters`, and `parent_id` is enough to walk the hierarchy from there.
        arrayFilter(
            leaf_or_ancestor_id -> dictHas('clusters_dict', (t.project_id, leaf_or_ancestor_id)),
            arrayDistinct(arrayFlatten(arrayMap(
                leaf_id -> arrayPushFront(
                    dictGetOrDefault('clusters_dict', 'path', (t.project_id, leaf_id), []),
                    leaf_id
                ),
                t.cluster_ids
            )))
        )
    ) AS Array(Tuple(
        id UUID,
        signal_id UUID,
        name String,
        level UInt8,
        parent_id UUID,
        num_signal_events UInt32,
        created_at DateTime64(9, 'UTC'),
        updated_at DateTime64(9, 'UTC')
    ))) AS clusters,
    t.agent_versions AS agent_versions
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
        groupUniqArrayArray(statuses) AS statuses,
        groupUniqArrayArray(trace_types) AS trace_types,
        groupUniqArrayArray(tags) AS tags,
        groupUniqArrayArray(span_names) AS span_names,
        groupArrayArray(signal_events) AS signal_events,
        groupUniqArrayArray(cluster_ids) AS cluster_ids,
        groupUniqArrayArray(agent_versions) AS agent_versions
    FROM (
        -- SELECT * cannot be flattened away: min(start_time) below aliases
        -- start_time, which would then resolve inside this WHERE.
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
    SELECT *
    FROM default.traces_static FINAL
    PREWHERE project_id = {project_id:UUID}
        AND start_time >= {min_start_time:DateTime64(9)}
        AND start_time <= {max_start_time:DateTime64(9)}
) AS ts
    ON t.project_id = ts.project_id AND t.id = ts.trace_id
WHERE t.start_time >= {min_start_time:DateTime64(9)}
    AND t.start_time <= {max_start_time:DateTime64(9)};

DROP VIEW IF EXISTS traces_v1;
CREATE VIEW IF NOT EXISTS traces_v1 SQL SECURITY INVOKER AS
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
    ifNull(ts.metadata, '') AS metadata,
    ifNull(ts.session_id, '') AS session_id,
    ifNull(ts.user_id, '') AS user_id,
    if(has(t.statuses, 'error'), 'error', 'success') AS status,
    ifNull(ts.root_span_id, toUUID('00000000-0000-0000-0000-000000000000')) AS top_span_id,
    ifNull(coalesce(ts.root_span_name, ts.root_span_name_from_path), '') AS top_span_name,
    CASE
        WHEN ts.root_span_type IS NULL THEN 'DEFAULT'
        WHEN ts.root_span_type = 'DEFAULT' THEN 'DEFAULT'
        WHEN ts.root_span_type = 'LLM' THEN 'LLM'
        WHEN ts.root_span_type = 'EXECUTOR' THEN 'EXECUTOR'
        WHEN ts.root_span_type = 'EVALUATOR' THEN 'EVALUATOR'
        WHEN ts.root_span_type = 'EVALUATION' THEN 'EVALUATION'
        WHEN ts.root_span_type = 'TOOL' THEN 'TOOL'
        WHEN ts.root_span_type = 'HUMAN_EVALUATOR' THEN 'HUMAN_EVALUATOR'
        WHEN ts.root_span_type = 'CACHED' THEN 'CACHED'
        ELSE 'UNKNOWN'
    END AS top_span_type,
    multiIf(
        has(t.trace_types, 'PLAYGROUND'), 'PLAYGROUND',
        has(t.trace_types, 'EVALUATION'), 'EVALUATION',
        'DEFAULT'
    ) AS trace_type,
    t.tags AS tags,
    tt.tags AS trace_tags,
    toBool(ifNull(ts.has_browser_session, 0)) AS has_browser_session,
    t.id AS id,
    t.span_names AS span_names,
    ifNull(ts.internal_metadata, '') AS internal_metadata,
    if(
        JSONExtractBool({policy:String}, 'maskPii'),
        '"[PII_MASKED_UNAVAILABLE]"',
        ifNull(ts.input, '')
    ) AS agent_input,
    -- Unsorted, and with no derived signal_ids/signal_severities, on purpose:
    -- an arraySort or a derived column here reads every tuple element including
    -- payload. See docs/internal/clickhouse-traces.md.
    t.signal_events AS signal_events,
    -- The CAST is what names the tuple elements: aliases inside tuple() are
    -- dropped, leaving positional .1/.2 access.
    CAST(arrayMap(
        cluster_id -> tuple(
            cluster_id,
            dictGetOrDefault('clusters_dict', 'signal_id', (t.project_id, cluster_id), toUUID('00000000-0000-0000-0000-000000000000')),
            dictGetOrDefault('clusters_dict', 'name', (t.project_id, cluster_id), ''),
            dictGetOrDefault('clusters_dict', 'level', (t.project_id, cluster_id), toUInt8(0)),
            dictGetOrDefault('clusters_dict', 'parent_id', (t.project_id, cluster_id), toUUID('00000000-0000-0000-0000-000000000000')),
            dictGetOrDefault('clusters_dict', 'num_signal_events', (t.project_id, cluster_id), toUInt32(0)),
            dictGetOrDefault('clusters_dict', 'created_at', (t.project_id, cluster_id), toDateTime64(0, 9, 'UTC')),
            dictGetOrDefault('clusters_dict', 'updated_at', (t.project_id, cluster_id), toDateTime64(0, 9, 'UTC'))
        ),
        -- `path` stays INTERNAL: it is what turns the trace's leaf-only
        -- `cluster_ids` into leaf + ancestors. It is deliberately not a field of
        -- the tuple below -- callers get the ancestors as their own elements of
        -- `clusters`, and `parent_id` is enough to walk the hierarchy from there.
        arrayFilter(
            leaf_or_ancestor_id -> dictHas('clusters_dict', (t.project_id, leaf_or_ancestor_id)),
            arrayDistinct(arrayFlatten(arrayMap(
                leaf_id -> arrayPushFront(
                    dictGetOrDefault('clusters_dict', 'path', (t.project_id, leaf_id), []),
                    leaf_id
                ),
                t.cluster_ids
            )))
        )
    ) AS Array(Tuple(
        id UUID,
        signal_id UUID,
        name String,
        level UInt8,
        parent_id UUID,
        num_signal_events UInt32,
        created_at DateTime64(9, 'UTC'),
        updated_at DateTime64(9, 'UTC')
    ))) AS clusters,
    t.agent_versions AS agent_versions
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
        groupUniqArrayArray(statuses) AS statuses,
        groupUniqArrayArray(trace_types) AS trace_types,
        groupUniqArrayArray(tags) AS tags,
        groupUniqArrayArray(span_names) AS span_names,
        groupArrayArray(signal_events) AS signal_events,
        groupUniqArrayArray(cluster_ids) AS cluster_ids,
        groupUniqArrayArray(agent_versions) AS agent_versions
    FROM (
        -- SELECT * cannot be flattened away: min(start_time) below aliases
        -- start_time, which would then resolve inside this WHERE.
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
    SELECT *
    FROM default.traces_static FINAL
    PREWHERE project_id = {project_id:UUID}
        AND start_time >= {min_start_time:DateTime64(9)}
        AND start_time <= {max_start_time:DateTime64(9)}
) AS ts
    ON t.project_id = ts.project_id AND t.id = ts.trace_id
WHERE t.start_time >= {min_start_time:DateTime64(9)}
    AND t.start_time <= {max_start_time:DateTime64(9)}
    AND trace_visible(ifNull(ts.user_id, ''), ifNull(ts.metadata, ''), {policy:String});
