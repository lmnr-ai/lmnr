ALTER TABLE evaluation_scores RENAME COLUMN IF EXISTS result_id TO evaluation_datapoint_id;
RENAME TABLE datapoints TO dataset_datapoints;
ALTER TABLE events ADD COLUMN IF NOT EXISTS trace_id UUID;
