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
    prompt_tokens Int64,
    completion_tokens Int64,
    total_tokens Int64,
    user_id String
)
ENGINE = MergeTree()
ORDER BY (project_id, start_time, trace_id, span_id)
SETTINGS index_granularity = 8192
SETTINGS flatten_nested=0
