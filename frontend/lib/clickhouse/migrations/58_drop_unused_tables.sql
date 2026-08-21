-- Drop ClickHouse tables with no writers for 6+ months (LAM-2153).
-- evaluation_datapoint_executor_outputs lost its last reader in migration 23,
-- when executor_output became a column on evaluation_datapoints; evaluator_scores
-- was superseded by evaluation_scores. span_tags is a hand-renamed copy of the
-- `tags` table migration 50 dropped (same DDL, still carrying the `tags_*` index
-- names) — it has no CREATE in this repo, so the IF EXISTS is what makes this a
-- no-op on a freshly-migrated database.
DROP TABLE IF EXISTS default.evaluation_datapoint_executor_outputs;
DROP TABLE IF EXISTS default.evaluator_scores;
DROP TABLE IF EXISTS default.span_tags;
