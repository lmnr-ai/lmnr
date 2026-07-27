-- Repoint evaluation_datapoints_v0's trace join from traces_replacing onto the
-- aggregating traces_agg table (LAM-2020). traces_agg has no FINAL semantics, so
-- the join target is a re-aggregating GROUP BY subquery. The view takes only
-- {project_id:UUID}, so the subquery is project-scoped with no time bound --
-- same scan profile as the traces_replacing FINAL it replaces.
DROP VIEW IF EXISTS evaluation_datapoints_v0;
CREATE VIEW IF NOT EXISTS evaluation_datapoints_v0
SQL SECURITY INVOKER
AS SELECT
    edp.id id,
    edp.evaluation_id evaluation_id,
    edp.data data,
    edp.target target,
    edp.metadata metadata,
    edp.executor_output executor_output,
    edp.index `index`,
    edp.trace_id trace_id,
    edp.group_id group_id,
    edp.scores scores,
    edp.updated_at updated_at,
    edp.updated_at created_at,
    edp.dataset_id dataset_id,
    edp.dataset_datapoint_id dataset_datapoint_id,
    edp.dataset_datapoint_created_at dataset_datapoint_created_at,
    end_time - start_time duration,
    t.input_cost input_cost,
    t.output_cost output_cost,
    t.total_cost total_cost,
    t.start_time start_time,
    t.end_time end_time,
    t.input_tokens input_tokens,
    t.output_tokens output_tokens,
    t.total_tokens total_tokens,
    t.status trace_status,
    t.metadata trace_metadata,
    t.tags trace_tags,
    t.top_span_id top_span_id,
    s.spans trace_spans
FROM evaluation_datapoints edp FINAL
LEFT JOIN
(
    SELECT
        project_id,
        id,
        min(start_time) AS start_time,
        max(end_time) AS end_time,
        sum(input_tokens) AS input_tokens,
        sum(output_tokens) AS output_tokens,
        sum(total_tokens) AS total_tokens,
        sum(input_cost) AS input_cost,
        sum(output_cost) AS output_cost,
        sum(total_cost) AS total_cost,
        if(has(groupUniqArrayArray(statuses), 'error'), 'error', 'success') AS status,
        max(top_span_id) AS top_span_id,
        groupUniqArrayArray(tags) AS tags,
        if(
            length(mapKeys(maxMap(metadata))) = 0,
            '',
            concat(
                '{',
                arrayStringConcat(
                    arrayMap(
                        (k, v) -> concat(toJSONString(k), ':', v),
                        mapKeys(maxMap(metadata)), mapValues(maxMap(metadata))
                    ),
                    ','
                ),
                '}'
            )
        ) AS metadata
    FROM traces_agg
    WHERE project_id = {project_id:UUID}
    GROUP BY project_id, id
) AS t ON (t.project_id = edp.project_id) AND (t.id = edp.trace_id)
LEFT JOIN
(
    SELECT
        trace_id,
        project_id,
        groupArray(
            CAST(
                tuple(name, duration, span_type)
                AS
                Tuple(name String, duration Float64, type String)
            )
        ) AS spans
    FROM spans
    WHERE project_id = {project_id:UUID}
    GROUP BY project_id, trace_id
) AS s ON (s.project_id = edp.project_id) AND (s.trace_id = edp.trace_id)
WHERE edp.project_id = {project_id:UUID};
