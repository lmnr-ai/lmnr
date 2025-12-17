CREATE TABLE IF NOT EXISTS default.new_tags
(
    `project_id` UUID,
    `created_at` DateTime64(9, 'UTC'),
    `id` UUID,
    `name` String,
    `source` UInt8,
    `span_id` UUID
    )
    ENGINE = MergeTree
    ORDER BY (project_id, name, created_at)
    SETTINGS index_granularity = 8192;

INSERT INTO new_tags(project_id, created_at, id, name, source, span_id)
SELECT project_id, created_at, id, name, source, span_id FROM tags;

RENAME TABLE tags TO old_tags;
RENAME TABLE new_tags TO tags;
DROP TABLE IF EXISTS old_tags;

ALTER TABLE tags ADD INDEX IF NOT EXISTS tags_created_at_minmax_idx created_at TYPE minmax;
ALTER TABLE tags MATERIALIZE INDEX tags_created_at_minmax_idx;
ALTER TABLE spans ADD INDEX IF NOT EXISTS spans_parent_span_id_bf_idx parent_span_id TYPE bloom_filter;
ALTER TABLE spans MATERIALIZE INDEX spans_parent_span_id_bf_idx;

ALTER TABLE tags ADD INDEX IF NOT EXISTS tags_span_id_bf_idx span_id TYPE bloom_filter;
ALTER TABLE tags MATERIALIZE INDEX tags_span_id_bf_idx;

DROP VIEW IF EXISTS tags_v0;
CREATE VIEW IF NOT EXISTS tags_v0 SQL SECURITY INVOKER AS
SELECT
    id,
    span_id,
    name,
    created_at,
    CASE
        WHEN source = 0 THEN 'HUMAN'
        WHEN source = 2 THEN 'CODE'
        ELSE 'UNKNOWN'
        END source
FROM tags
WHERE project_id={project_id:UUID};