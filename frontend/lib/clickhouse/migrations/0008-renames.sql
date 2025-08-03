ALTER TABLE evaluation_scores RENAME COLUMN result_id TO evaluation_datapoint_id;
RENAME TABLE datapoints TO dataset_datapoints;
ALTER TABLE events ADD COLUMN trace_id UUID;
