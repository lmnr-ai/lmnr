CREATE TABLE spans
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
    path String DEFAULT '<null>'
)
ENGINE = MergeTree()
ORDER BY (project_id, start_time, trace_id, span_id)
SETTINGS index_granularity = 8192;

CREATE TABLE events (
    id UUID,
    timestamp DateTime64(9, 'UTC'),
    source Enum8('CODE' = 0, 'AUTO', 'MANUAL'),
    template_id UUID,
    template_name String,
    event_type Enum8('BOOLEAN' = 0, 'NUMBER', 'STRING'),
    project_id UUID
) 
ENGINE MergeTree()
ORDER BY (project_id, template_id, id)
SETTINGS index_granularity = 8192 SETTINGS flatten_nested=0;

CREATE TABLE evaluation_scores (
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
    `value_key` String,
    `value` Float64,
    `span_id` UUID
)
ENGINE MergeTree
PRIMARY KEY (project_id, class_id, span_id)
ORDER BY (project_id, class_id, span_id, created_at, id)
SETTINGS index_granularity = 8192
