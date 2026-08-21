-- Drop ClickHouse tables with no writers for 6+ months (LAM-2153).
-- evaluation_datapoint_executor_outputs lost its last reader in migration 23,
-- when executor_output became a column on evaluation_datapoints; evaluator_scores
-- was superseded by evaluation_scores; old_spans is the pre-reorder spans table
-- that migration 33 renamed aside and left behind with its DROP commented out.
DROP TABLE IF EXISTS default.old_spans;
DROP TABLE IF EXISTS default.evaluation_datapoint_executor_outputs;
DROP TABLE IF EXISTS default.evaluator_scores;
