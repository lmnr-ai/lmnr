-- Drop ClickHouse tables with no writers for 6+ months (LAM-2153).
-- evaluation_datapoint_executor_outputs lost its last reader in migration 23,
-- when executor_output became a column on evaluation_datapoints; evaluator_scores
-- and evaluation_scores were both superseded by the denormalized
-- evaluation_datapoints.scores column; trace_summaries outlived its feature.
DROP TABLE IF EXISTS default.evaluation_datapoint_executor_outputs;
DROP TABLE IF EXISTS default.evaluator_scores;
DROP TABLE IF EXISTS default.evaluation_scores;
DROP TABLE IF EXISTS default.trace_summaries;
