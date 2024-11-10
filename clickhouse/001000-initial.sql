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
    value Float64
) ENGINE = MergeTree()
ORDER BY (project_id, group_id, timestamp, evaluation_id, name)
SETTINGS index_granularity = 8192
SETTINGS flatten_nested=0;
