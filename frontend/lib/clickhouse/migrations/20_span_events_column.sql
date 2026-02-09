ALTER TABLE spans ADD COLUMN IF NOT EXISTS events Array(Tuple(timestamp Int64, name String, attributes String)) DEFAULT [];

DROP VIEW IF EXISTS spans_v0;
CREATE VIEW IF NOT EXISTS spans_v0 SQL SECURITY INVOKER AS
    SELECT
        span_id,
        name,
        CASE
            WHEN span_type = 0 THEN 'DEFAULT'
            WHEN span_type = 1 THEN 'LLM'
            WHEN span_type = 3 THEN 'EXECUTOR'
            WHEN span_type = 4 THEN 'EVALUATOR'
            WHEN span_type = 5 THEN 'EVALUATION'
            WHEN span_type = 6 THEN 'TOOL'
            WHEN span_type = 7 THEN 'HUMAN_EVALUATOR'
            WHEN span_type = 8 THEN 'CACHED'
            ELSE 'UNKNOWN'
        END AS span_type,
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
        input,
        output,
        CASE
          WHEN status = 'error' THEN 'error'
          WHEN status = 'success' THEN 'success'
          ELSE 'success'
        END AS status,
        parent_span_id,
        attributes,
        tags_array as tags,
        events
    FROM spans
    WHERE project_id={project_id:UUID};