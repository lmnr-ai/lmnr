CREATE TABLE IF NOT EXISTS default.trace_summaries
(
    `id` UUID DEFAULT generateUUIDv4(),
    `project_id` UUID,
    `created_at` DateTime64(3) DEFAULT now64(),
    `trace_id` UUID,
    `summary` String CODEC(ZSTD(3)),
    `status` LowCardinality(String),
    `analysis` String CODEC(ZSTD(3)),
    `analysis_preview` String,
    `span_ids_map` String
)
ENGINE = MergeTree()
PRIMARY KEY (project_id, trace_id)
ORDER BY (project_id, trace_id)
SETTINGS index_granularity = 8192