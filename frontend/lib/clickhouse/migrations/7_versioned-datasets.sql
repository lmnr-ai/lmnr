CREATE TABLE IF NOT EXISTS default.new_dataset_datapoints
(
    `id` UUID,
    `dataset_id` UUID,
    `project_id` UUID,
    `created_at` DateTime64(9, 'UTC') DEFAULT now64(9, 'UTC'),
    `data` String CODEC(ZSTD(3)),
    `target` String CODEC(ZSTD(3)),
    `metadata` String CODEC(ZSTD(3))
)
ENGINE = MergeTree()
ORDER BY (project_id, dataset_id, toUInt128(id), created_at)
SETTINGS index_granularity = 8192;

INSERT INTO default.new_dataset_datapoints
SELECT
    dateTimeToUUIDv7(toDateTime(created_at)),
    dataset_id,
    project_id,
    created_at,
    data,
    target,
    metadata
FROM default.dataset_datapoints
-- only insert if the new table is empty
WHERE NOT EXISTS (
    SELECT 1
    FROM default.new_dataset_datapoints 
    LIMIT 1
);

DROP TABLE IF EXISTS default.dataset_datapoints;

RENAME TABLE default.new_dataset_datapoints TO default.dataset_datapoints;

DROP VIEW IF EXISTS dataset_datapoints_v0;

CREATE VIEW IF NOT EXISTS dataset_datapoints_v0 SQL SECURITY INVOKER AS
    SELECT
        id,
        created_at,
        dataset_id,
        project_id,
        data,
        target,
        metadata
    FROM dataset_datapoints
    WHERE project_id={project_id:UUID}
    QUALIFY ROW_NUMBER() OVER (PARTITION BY project_id, dataset_id, id ORDER BY created_at DESC) = 1;

CREATE VIEW IF NOT EXISTS dataset_datapoint_versions_v0 SQL SECURITY INVOKER AS
    SELECT
        id,
        created_at,
        dataset_id,
        data,
        target,
        metadata,
        project_id
    FROM dataset_datapoints
    WHERE project_id={project_id:UUID};
