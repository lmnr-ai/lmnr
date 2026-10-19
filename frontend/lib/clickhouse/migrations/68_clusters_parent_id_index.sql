-- The table's primary key is (project_id, signal_id), so `parent_id = X` reads
-- every cluster of the signal. A bloom filter lets the children lookups
-- (`ClusterStore::get_children_clusters`) skip granules that contain no
-- child of the requested parent.
ALTER TABLE signal_event_clusters ADD INDEX IF NOT EXISTS signal_event_clusters_parent_id_idx parent_id TYPE bloom_filter GRANULARITY 1;

ALTER TABLE signal_event_clusters MATERIALIZE INDEX signal_event_clusters_parent_id_idx;
