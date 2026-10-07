ALTER TABLE signal_events ADD COLUMN IF NOT EXISTS summaries Array(String) CODEC(ZSTD(3));

-- Re-key: cluster-first for cluster-scoped reads; cityHash64(content) keeps an
-- event's distinct summaries in one cluster as separate rows while exact
-- retries still collapse.
DROP TABLE IF EXISTS events_to_clusters;
CREATE TABLE events_to_clusters
(
    project_id UUID,
    event_id   UUID,
    cluster_id UUID,
    content    String,
    created_at DateTime64(9, 'UTC') DEFAULT now64(9)
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (project_id, cluster_id, event_id, cityHash64(content))
SETTINGS index_granularity = 8192;

-- Rebuild clusters from scratch on the per-summary pipeline. Same layout as
-- migrations 48+52, declared inline (fresh table needs no ALTER/MATERIALIZE).
DROP TABLE IF EXISTS signal_event_clusters;
CREATE TABLE signal_event_clusters
(
    id UUID,
    project_id UUID,
    signal_id UUID,
    name String,
    level UInt8,
    centroid Array(BFloat16) CODEC(NONE),
    parent_id UUID,
    -- Counts summary memberships, not distinct events: an event contributes
    -- once per clustered summary. Historical name kept for schema stability.
    num_signal_events UInt32,
    num_children_clusters UInt16,
    created_at DateTime64(9, 'UTC'),
    updated_at DateTime64(9, 'UTC'),
    centroid_at_naming Array(BFloat16) DEFAULT centroid CODEC(NONE),
    CONSTRAINT centroid_same_dim CHECK length(centroid) = 768,
    CONSTRAINT signal_event_clusters_centroid_at_naming_dim_768 CHECK length(centroid_at_naming) = 768,
    INDEX signal_event_clusters_centroid_cosine_hnsw centroid TYPE vector_similarity(
        'hnsw',
        cosineDistance,
        768
    ),
    -- Serves the (project_id, id) joins that carry no signal_id:
    -- event_clusters_all_v0, signal_events_v0's clusters subquery, id IN reads.
    INDEX signal_event_clusters_project_id_cluster_id_idx (project_id, id) TYPE bloom_filter GRANULARITY 1
)
ENGINE = ReplacingMergeTree(updated_at)
PRIMARY KEY (project_id, signal_id)
ORDER BY (project_id, signal_id, id);

-- 3072-dim inspection copy parked by migration 48; obsolete now that all
-- cluster data is rebuilt.
DROP TABLE IF EXISTS signal_event_clusters_768;
