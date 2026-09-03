-- LAM-2199 data model: signal events joinable with traces, time-bounded views,
-- retention via TTL, llm_messages folded into deduped_content.
--
-- 1. trace_signal_events: one row per (trace, signal event, summary, cluster).
--    Written by the signals pipeline when an event is created (cluster_id nil)
--    and by the clusterer when a summary is assigned to a cluster. traces_v0
--    joins it (small per-project table, PREWHERE on trace_start_time) to expose
--    signals / summaries / clusters per trace, so
--    `SELECT ... FROM traces WHERE has(clusters, 'X')` needs no user-side join.
--    Legacy events (trace_start_time = epoch 0) are outside every traces_v0
--    time window and therefore never appear there.
CREATE TABLE IF NOT EXISTS default.trace_signal_events
(
    `project_id` UUID,
    `trace_id` UUID,
    `trace_start_time` DateTime64(9, 'UTC'),
    `event_id` UUID,
    `signal_id` UUID,
    `signal_name` String,
    `severity` UInt8,
    `event_timestamp` DateTime64(9, 'UTC'),
    `summary` String CODEC(ZSTD(3)),
    -- nil UUID until the clusterer assigns the summary to a cluster
    `cluster_id` UUID,
    `updated_at` DateTime64(9, 'UTC') DEFAULT now64(9),
    INDEX tse_cluster_id_idx cluster_id TYPE bloom_filter GRANULARITY 1
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(trace_start_time)
ORDER BY (project_id, trace_id, event_id, cluster_id, cityHash64(summary))
SETTINGS index_granularity = 8192;

-- 2. signal_events: denormalized trace fields so the signal_events view can be
--    filtered on trace attributes without a join to traces.
ALTER TABLE default.signal_events
    ADD COLUMN IF NOT EXISTS trace_start_time DateTime64(9, 'UTC') DEFAULT toDateTime64(0, 9, 'UTC');
ALTER TABLE default.signal_events
    ADD COLUMN IF NOT EXISTS user_id String DEFAULT '';
ALTER TABLE default.signal_events
    ADD COLUMN IF NOT EXISTS session_id String DEFAULT '';
ALTER TABLE default.signal_events
    ADD COLUMN IF NOT EXISTS top_span_name String DEFAULT '';

-- 3. trace_tags: carry the trace start so traces_v0 can bound its scan. Rows
--    written before this migration keep epoch 0 and are matched by the
--    `OR start_time = epoch` clause in the view.
ALTER TABLE default.trace_tags
    ADD COLUMN IF NOT EXISTS start_time DateTime64(9, 'UTC') DEFAULT toDateTime64(0, 9, 'UTC');

-- 4. Retention. `expires_at` is computed by the writer from the workspace tier
--    (retention days + grace); the far-future default means "never expires",
--    which is what every pre-existing row and every self-hosted row gets.
--    TTL is evaluated at merge time, so reads keep clamping to the tier
--    cutoff (query engine) — the TTL only reclaims storage.
ALTER TABLE default.traces_agg
    ADD COLUMN IF NOT EXISTS expires_at SimpleAggregateFunction(max, DateTime('UTC'))
        DEFAULT toDateTime('2106-01-01 00:00:00', 'UTC');
ALTER TABLE default.traces_agg MODIFY TTL expires_at;

ALTER TABLE default.traces_static
    ADD COLUMN IF NOT EXISTS expires_at DateTime('UTC') DEFAULT toDateTime('2106-01-01 00:00:00', 'UTC');
ALTER TABLE default.traces_static MODIFY TTL expires_at;

ALTER TABLE default.deduped_content
    ADD COLUMN IF NOT EXISTS expires_at DateTime('UTC') DEFAULT toDateTime('2106-01-01 00:00:00', 'UTC');
ALTER TABLE default.deduped_content MODIFY TTL expires_at;

-- 5. llm_messages -> deduped_content. Same content-addressed hashes, so the
--    trace-scoped rows fold into the project-scoped table and spans_v0 no
--    longer needs the llm_messages_dict fallback.
INSERT INTO default.deduped_content (project_id, content_hash, content, last_seen_at)
SELECT project_id, message_hash, content, last_seen_at
FROM default.llm_messages;

DROP VIEW IF EXISTS default.spans_v0;
CREATE VIEW IF NOT EXISTS default.spans_v0 SQL SECURITY INVOKER AS
    SELECT
        span_id,
        name,
        multiIf(
            span_kind = 0, 'DEFAULT',
            span_kind = 1, 'LLM',
            span_kind = 3, 'EXECUTOR',
            span_kind = 4, 'EVALUATOR',
            span_kind = 5, 'EVALUATION',
            span_kind = 6, 'TOOL',
            span_kind = 7, 'HUMAN_EVALUATOR',
            span_kind = 8, 'CACHED',
            'UNKNOWN'
        ) AS span_type,
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
        if(
            notEmpty(input_message_hashes),
            '[' || arrayStringConcat(
                arrayMap(
                    h -> dictGetOrDefault(
                        'deduped_content_dict',
                        'content',
                        tuple(project_id, h),
                        'null'
                    ),
                    input_message_hashes
                ),
                ','
            ) || ']',
            input
        ) AS input,
        if(
            notEmpty(output_message_hashes),
            '[' || arrayStringConcat(
                arrayMap(
                    h -> dictGetOrDefault(
                        'deduped_content_dict',
                        'content',
                        tuple(project_id, h),
                        'null'
                    ),
                    output_message_hashes
                ),
                ','
            ) || ']',
            output
        ) AS output,
        if(
            tool_definitions_hash != toFixedString('', 32),
            dictGetOrDefault(
                'deduped_content_dict',
                'content',
                tuple(project_id, tool_definitions_hash),
                ''
            ),
            ''
        ) AS tool_definitions,
        multiIf(status = 'error', 'error', status = 'success', 'success', 'success') AS status,
        parent_span_id,
        attributes,
        tags_array AS tags,
        events
    FROM default.spans
    WHERE project_id = {project_id:UUID};

DROP DICTIONARY IF EXISTS default.llm_messages_dict;
DROP TABLE IF EXISTS default.llm_messages;

-- 6. traces_v0: same columns as before plus the signal leg
--    (signals, signal_ids, signal_event_ids, signal_severity, signal_summaries,
--    clusters, cluster_ids). Cluster names come from a LEFT JOIN on the tiny
--    per-project signal_event_clusters table; level 0 clusters stay hidden.
--    Padded-bounds contract unchanged (see migration 54).
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
    se.signals AS signals,
    se.signal_ids AS signal_ids,
    se.signal_event_ids AS signal_event_ids,
    if(empty(se.signal_event_ids), NULL, se.signal_severity) AS signal_severity,
    se.signal_summaries AS signal_summaries,
    se.clusters AS clusters,
    se.cluster_ids AS cluster_ids
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
        groupUniqArrayArray(span_names) AS span_names
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
    SELECT project_id, trace_id, tags
    FROM default.trace_tags FINAL
    WHERE project_id = {project_id:UUID}
        AND start_time <= {max_start_time:DateTime64(9)}
        AND (start_time >= {min_start_time:DateTime64(9)} OR start_time = toDateTime64(0, 9, 'UTC'))
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
LEFT JOIN (
    SELECT
        tse.project_id AS project_id,
        tse.trace_id AS trace_id,
        groupUniqArray(tse.signal_name) AS signals,
        groupUniqArray(tse.signal_id) AS signal_ids,
        groupUniqArray(tse.event_id) AS signal_event_ids,
        max(tse.severity) AS signal_severity,
        arrayFilter(x -> x != '', groupUniqArray(tse.summary)) AS signal_summaries,
        arrayFilter(x -> x != '', groupUniqArrayIf(c.name, c.level > 0)) AS clusters,
        groupUniqArrayIf(tse.cluster_id, c.level > 0) AS cluster_ids
    FROM (
        SELECT project_id, trace_id, event_id, signal_id, signal_name, severity, summary, cluster_id
        FROM default.trace_signal_events FINAL
        PREWHERE project_id = {project_id:UUID}
            AND trace_start_time >= {min_start_time:DateTime64(9)}
            AND trace_start_time <= {max_start_time:DateTime64(9)}
    ) AS tse
    LEFT JOIN (
        SELECT project_id, id, name, level
        FROM default.signal_event_clusters FINAL
        PREWHERE project_id = {project_id:UUID}
    ) AS c
        ON tse.project_id = c.project_id AND tse.cluster_id = c.id
    GROUP BY tse.project_id, tse.trace_id
) AS se
    ON t.project_id = se.project_id AND t.id = se.trace_id
WHERE t.start_time >= {min_start_time:DateTime64(9)}
    AND t.start_time <= {max_start_time:DateTime64(9)};

-- 7. signal_events views: time-bounded on `timestamp`, plus the denormalized
--    trace columns and `summaries`. Cluster resolution is unchanged.
DROP VIEW IF EXISTS default.signal_events_v0;
CREATE VIEW IF NOT EXISTS default.signal_events_v0 SQL SECURITY INVOKER AS
SELECT
    e.id AS id,
    e.project_id AS project_id,
    e.signal_id AS signal_id,
    e.trace_id AS trace_id,
    e.run_id AS run_id,
    e.name AS name,
    e.payload AS payload,
    e.timestamp AS timestamp,
    e.severity AS severity,
    e.summary AS summary,
    e.summaries AS summaries,
    e.trace_start_time AS trace_start_time,
    e.user_id AS user_id,
    e.session_id AS session_id,
    e.top_span_name AS top_span_name,
    ca.clusters AS clusters
FROM default.signal_events AS e
LEFT JOIN (
    SELECT
        ec.project_id AS project_id,
        ec.event_id AS event_id,
        arrayDistinct(groupArray(ec.cluster_id)) AS clusters
    FROM default.events_to_clusters AS ec FINAL
    INNER JOIN default.signal_event_clusters AS c FINAL
        ON ec.project_id = c.project_id AND ec.cluster_id = c.id AND c.level > 0
    PREWHERE ec.project_id = {project_id:UUID}
    GROUP BY ec.project_id, ec.event_id
) AS ca
    ON e.project_id = ca.project_id AND e.id = ca.event_id
WHERE e.project_id = {project_id:UUID}
    AND e.timestamp >= {min_timestamp:DateTime64(9)}
    AND e.timestamp <= {max_timestamp:DateTime64(9)};

DROP VIEW IF EXISTS default.signal_events_all_v0;
CREATE VIEW IF NOT EXISTS default.signal_events_all_v0 SQL SECURITY INVOKER AS
SELECT
    e.id AS id,
    e.project_id AS project_id,
    e.signal_id AS signal_id,
    e.trace_id AS trace_id,
    e.run_id AS run_id,
    e.name AS name,
    e.payload AS payload,
    e.timestamp AS timestamp,
    e.severity AS severity,
    e.summary AS summary,
    e.summaries AS summaries,
    e.trace_start_time AS trace_start_time,
    e.user_id AS user_id,
    e.session_id AS session_id,
    e.top_span_name AS top_span_name,
    ca.clusters AS clusters
FROM default.signal_events AS e
LEFT JOIN (
    SELECT
        ec.project_id AS project_id,
        ec.event_id AS event_id,
        arrayDistinct(groupArray(ec.cluster_id)) AS clusters
    FROM default.events_to_clusters AS ec FINAL
    PREWHERE ec.project_id = {project_id:UUID}
    GROUP BY ec.project_id, ec.event_id
) AS ca
    ON e.project_id = ca.project_id AND e.id = ca.event_id
WHERE e.project_id = {project_id:UUID}
    AND e.timestamp >= {min_timestamp:DateTime64(9)}
    AND e.timestamp <= {max_timestamp:DateTime64(9)};

-- 8. evaluation_datapoints_v0: every joined leg is scoped to the datapoints'
--    trace ids, the requested evaluations (empty array = all) and the trace
--    start window. Before this the spans leg scanned the whole project.
DROP VIEW IF EXISTS default.evaluation_datapoints_v0;
CREATE VIEW IF NOT EXISTS default.evaluation_datapoints_v0 SQL SECURITY INVOKER AS
SELECT
    edp.id AS id,
    edp.evaluation_id AS evaluation_id,
    edp.data AS data,
    edp.target AS target,
    edp.metadata AS metadata,
    edp.executor_output AS executor_output,
    edp.index AS `index`,
    edp.trace_id AS trace_id,
    edp.group_id AS group_id,
    edp.scores AS scores,
    edp.updated_at AS updated_at,
    edp.updated_at AS created_at,
    edp.dataset_id AS dataset_id,
    edp.dataset_datapoint_id AS dataset_datapoint_id,
    edp.dataset_datapoint_created_at AS dataset_datapoint_created_at,
    t.end_time - t.start_time AS duration,
    t.input_cost AS input_cost,
    t.output_cost AS output_cost,
    t.total_cost AS total_cost,
    t.start_time AS start_time,
    t.end_time AS end_time,
    t.input_tokens AS input_tokens,
    t.output_tokens AS output_tokens,
    t.total_tokens AS total_tokens,
    toLowCardinality(if(has(t.statuses, 'error'), 'error', 'success')) AS trace_status,
    ifNull(ts.metadata, '') AS trace_metadata,
    t.tags AS trace_tags,
    ifNull(ts.root_span_id, toUUID('00000000-0000-0000-0000-000000000000')) AS top_span_id,
    s.spans AS trace_spans
FROM default.evaluation_datapoints AS edp FINAL
LEFT JOIN (
    SELECT
        project_id,
        id,
        CAST(min(start_time) AS DateTime64(9, 'UTC')) AS start_time,
        CAST(max(end_time) AS DateTime64(9, 'UTC')) AS end_time,
        sum(input_tokens) AS input_tokens,
        sum(output_tokens) AS output_tokens,
        sum(total_tokens) AS total_tokens,
        sum(input_cost) AS input_cost,
        sum(output_cost) AS output_cost,
        sum(total_cost) AS total_cost,
        groupUniqArrayArray(statuses) AS statuses,
        groupUniqArrayArray(tags) AS tags
    -- filter in an inner SELECT: the `start_time` alias above would otherwise
    -- rebind the WHERE to the aggregate (ILLEGAL_AGGREGATION)
    FROM (
        SELECT *
        FROM default.traces_agg
        WHERE project_id = {project_id:UUID}
            AND start_time >= {min_start_time:DateTime64(9)}
            AND start_time <= {max_start_time:DateTime64(9)}
            AND id IN (
                SELECT trace_id FROM default.evaluation_datapoints
                WHERE project_id = {project_id:UUID}
                    AND (empty({evaluation_ids:Array(UUID)}) OR evaluation_id IN {evaluation_ids:Array(UUID)})
            )
    )
    GROUP BY project_id, id
) AS t
    ON t.project_id = edp.project_id AND t.id = edp.trace_id
LEFT JOIN (
    SELECT project_id, trace_id, metadata, root_span_id
    FROM default.traces_static FINAL
    PREWHERE project_id = {project_id:UUID}
        AND start_time >= {min_start_time:DateTime64(9)}
        AND start_time <= {max_start_time:DateTime64(9)}
        AND trace_id IN (
            SELECT trace_id FROM default.evaluation_datapoints
            WHERE project_id = {project_id:UUID}
                AND (empty({evaluation_ids:Array(UUID)}) OR evaluation_id IN {evaluation_ids:Array(UUID)})
        )
) AS ts
    ON ts.project_id = edp.project_id AND ts.trace_id = edp.trace_id
LEFT JOIN (
    SELECT
        trace_id,
        project_id,
        groupArray(
            CAST(
                tuple(
                    name,
                    (toUnixTimestamp64Nano(end_time) - toUnixTimestamp64Nano(start_time)) / 1000000000,
                    span_type
                )
                AS Tuple(name String, duration Float64, type String)
            )
        ) AS spans
    FROM default.spans
    WHERE project_id = {project_id:UUID}
        AND start_time >= {min_start_time:DateTime64(9)}
        AND start_time <= {max_start_time:DateTime64(9)}
        AND trace_id IN (
            SELECT trace_id FROM default.evaluation_datapoints
            WHERE project_id = {project_id:UUID}
                AND (empty({evaluation_ids:Array(UUID)}) OR evaluation_id IN {evaluation_ids:Array(UUID)})
        )
    GROUP BY project_id, trace_id
) AS s
    ON s.project_id = edp.project_id AND s.trace_id = edp.trace_id
WHERE edp.project_id = {project_id:UUID}
    AND (empty({evaluation_ids:Array(UUID)}) OR edp.evaluation_id IN {evaluation_ids:Array(UUID)});
