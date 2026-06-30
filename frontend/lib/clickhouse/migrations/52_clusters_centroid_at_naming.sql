-- Record the centroid a cluster had at the moment it was (re)named, so we
-- can measure how far it has drifted since and decide when to rename.
-- DEFAULT centroid seeds existing rows with their current centroid; the
-- column is written explicitly at naming time and never overwritten as the
-- centroid shifts afterward. CODEC(NONE) matches the `centroid` column.
ALTER TABLE signal_event_clusters ADD COLUMN centroid_at_naming Array(BFloat16) DEFAULT centroid CODEC(NONE);
ALTER TABLE signal_event_clusters ADD CONSTRAINT signal_event_clusters_centroid_at_naming_dim_768 CHECK length(centroid_at_naming) = 768;
