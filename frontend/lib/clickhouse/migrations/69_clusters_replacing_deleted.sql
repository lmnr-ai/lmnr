-- Successor of signal_event_clusters with ReplacingMergeTree's native
-- `is_deleted`: the clusterer deletes by inserting a tombstone (full row,
-- is_deleted = 1, newer updated_at) instead of a lightweight DELETE, and
-- `FINAL` hides the key. Monthly partitions on updated_at keep merges small;
-- `FINAL` still dedups across partitions (do_not_merge_across_partitions_select_final = 0).
-- No vector index: nearest-cluster lookups are brute-force cosineDistance
-- scans bound to (project_id, signal_id).
--
-- Only creates the table. `scripts/rebuild-signal-clusters.ts` copies the
-- data and swaps it in with EXCHANGE TABLES, after which the old table lives
-- on as signal_event_clusters_v2 until it is dropped by hand.
--
-- Leave `clean_deleted_rows` at its default: tombstones must survive merges,
-- or a merge that sees only the tombstone's partition would drop it while the
-- older live row in another partition resurfaces.
CREATE TABLE IF NOT EXISTS signal_event_clusters_v2
(
    id UUID,
    project_id UUID,
    signal_id UUID,
    name String,
    level UInt8,
    centroid Array(BFloat16) CODEC(NONE),
    parent_id UUID,
    -- Counts summary memberships, not distinct events.
    num_signal_events UInt32,
    num_children_clusters UInt16,
    created_at DateTime64(9, 'UTC'),
    updated_at DateTime64(9, 'UTC'),
    centroid_at_naming Array(BFloat16) DEFAULT centroid CODEC(NONE),
    num_signal_events_at_naming UInt32 DEFAULT num_signal_events,
    -- Last, so inserts from an app-server that does not know the column
    -- (named-column RowBinary) default to a live row.
    is_deleted UInt8 DEFAULT 0,
    CONSTRAINT centroid_same_dim CHECK length(centroid) = 768,
    CONSTRAINT signal_event_clusters_centroid_at_naming_dim_768 CHECK length(centroid_at_naming) = 768,
    -- Serves the (project_id, id) joins that carry no signal_id.
    INDEX signal_event_clusters_project_id_cluster_id_idx (project_id, id) TYPE bloom_filter GRANULARITY 1,
    -- Serves the children lookups (`parent_id = X` within a signal).
    INDEX signal_event_clusters_parent_id_idx parent_id TYPE bloom_filter GRANULARITY 1
)
ENGINE = ReplacingMergeTree(updated_at, is_deleted)
PARTITION BY toStartOfMonth(updated_at)
PRIMARY KEY (project_id, signal_id)
ORDER BY (project_id, signal_id, id);
