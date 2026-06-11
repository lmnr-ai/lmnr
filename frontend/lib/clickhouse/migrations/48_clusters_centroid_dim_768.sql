-- Realign signal_event_clusters.centroid dimension with the clusterer's
-- EMBEDDING_DIMENSION (768, local EmbeddingGemma). Migration 28 pinned both the
-- CHECK constraint and the HNSW index to 3072, so every 768-dim insert failed
-- (Code: 469 centroid_same_dim). We swap in a fresh 768-dim table rather than
-- ALTER the constraint in place, because adding a constraint to an already
-- populated 3072-dim table would fail. Any pre-existing clusters are preserved
-- in `old_signal_event_clusters_3072` for operators who want to inspect them;
-- it is safe to drop once no longer needed.
CREATE TABLE IF NOT EXISTS signal_event_clusters_768
(
    `id` UUID,
    `project_id` UUID,
    `signal_id` UUID,
    `name` String,
    `level` UInt8,
    `centroid` Array(BFloat16) CODEC(NONE),
    `parent_id` UUID,
    `num_signal_events` UInt32,
    `num_children_clusters` UInt16,
    `created_at` DateTime64(9, 'UTC'),
    `updated_at` DateTime64(9, 'UTC'),
    CONSTRAINT centroid_same_dim CHECK length(centroid) = 768
)
ENGINE = ReplacingMergeTree(updated_at)
PRIMARY KEY (project_id, signal_id)
ORDER BY (project_id, signal_id, id);

ALTER TABLE signal_event_clusters_768 ADD INDEX centroid_cosine_hnsw centroid TYPE vector_similarity(
    'hnsw',
    cosineDistance,
    768
);

ALTER TABLE signal_event_clusters_768 MATERIALIZE INDEX centroid_cosine_hnsw;

ALTER TABLE signal_event_clusters_768 ADD INDEX clusters_project_id_cluster_id_idx (project_id, id) TYPE bloom_filter GRANULARITY 1;

ALTER TABLE signal_event_clusters_768 MATERIALIZE INDEX clusters_project_id_cluster_id_idx;

EXCHANGE TABLES signal_event_clusters AND signal_event_clusters_768;

RENAME TABLE signal_event_clusters_768 TO old_signal_event_clusters_3072;
