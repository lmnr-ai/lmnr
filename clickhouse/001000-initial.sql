CREATE TABLE default.spans
(
    span_id UUID,
    name String,
    span_type UInt8,
    start_time DateTime64(9, 'UTC'),
    end_time DateTime64(9, 'UTC'),
    input_cost Float64,
    output_cost Float64,
    total_cost Float64,
    model String,
    session_id String,
    project_id UUID,
    trace_id UUID,
    provider String,
    input_tokens Int64,
    output_tokens Int64,
    total_tokens Int64,
    user_id String,
    path String DEFAULT '<null>',
    input String CODEC(ZSTD(3)),
    output String CODEC(ZSTD(3)),
    -- Add materialized columns for case-insensitive search
    input_lower String MATERIALIZED lower(input) CODEC(ZSTD(3)),
    output_lower String MATERIALIZED lower(output) CODEC(ZSTD(3))
)
ENGINE = MergeTree()
ORDER BY (project_id, start_time, trace_id, span_id)
SETTINGS index_granularity = 8192;

CREATE TABLE default.events
(
    `id` UUID,
    `project_id` UUID,
    `span_id` UUID,
    `timestamp` DateTime64(9, 'UTC'),
    `name` String
)
ENGINE MergeTree
ORDER BY (project_id, name, timestamp, span_id)
SETTINGS index_granularity = 8192;

CREATE TABLE default.evaluation_scores (
    project_id UUID,
    group_id String,
    timestamp DateTime64(9, 'UTC'),
    evaluation_id UUID,
    result_id UUID,
    name String,
    value Float64,
    label_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'
) ENGINE = MergeTree()
ORDER BY (project_id, group_id, timestamp, evaluation_id, name)
SETTINGS index_granularity = 8192
SETTINGS flatten_nested=0;

CREATE TABLE default.labels
(
    `project_id` UUID,
    `class_id` UUID,
    `created_at` DateTime64(9, 'UTC'),
    `id` UUID,
    `name` String,
    `label_source` UInt8,
    `span_id` UUID
)
ENGINE MergeTree
PRIMARY KEY (project_id, class_id, span_id)
ORDER BY (project_id, class_id, span_id, created_at, id)
SETTINGS index_granularity = 8192;

CREATE TABLE default.browser_session_events
(
    `event_id` UUID,
    `trace_id` UUID,
    `session_id` UUID,
    `timestamp` DateTime64(3),
    `event_type` UInt8,
    `data` String CODEC(ZSTD(3)),
    `project_id` UUID
)
ENGINE = MergeTree
PARTITION BY (toYYYYMM(timestamp), project_id)
ORDER BY (session_id, timestamp)
SETTINGS index_granularity = 8192;


ALTER TABLE default.spans
    -- Improved index configuration
    ADD INDEX input_case_insensitive_idx input_lower TYPE tokenbf_v1(3, 4, 0) GRANULARITY 4,
    ADD INDEX output_case_insensitive_idx output_lower TYPE tokenbf_v1(3, 4, 0) GRANULARITY 4;
