-- Record how many findings a cluster held at the moment it was (re)named, so
-- the rename trigger can fire on growth rather than on centroid drift alone.
-- Drift is size-blind in the wrong direction: a leaf's centroid moves by ~1/n
-- per finding, so `max_rename_drift` fires constantly on a 6-finding cluster
-- and essentially never on a 4,000-finding one — exactly where a name written
-- from the first handful of findings has the most material to have outgrown.
-- DEFAULT num_signal_events seeds existing rows with their CURRENT size, so no
-- cluster looks like it grew on the deploy and there is no rename storm.
ALTER TABLE signal_event_clusters ADD COLUMN IF NOT EXISTS num_signal_events_at_naming UInt32 DEFAULT num_signal_events;
