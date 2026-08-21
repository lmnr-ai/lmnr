-- Drop ClickHouse tables with no writers for 6+ months (LAM-2153).
-- evaluation_datapoint_executor_outputs lost its last reader in migration 23,
-- when executor_output became a column on evaluation_datapoints; evaluator_scores
-- was superseded by evaluation_scores; traces_to_clusters predates the
-- events_to_clusters clustering path and only survives on old deployments.
DROP TABLE IF EXISTS default.traces_to_clusters;
DROP TABLE IF EXISTS default.evaluation_datapoint_executor_outputs;
DROP TABLE IF EXISTS default.evaluator_scores;
