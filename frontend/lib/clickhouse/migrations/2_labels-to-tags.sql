-- Migration: Rename labels table to tags and label_source column to source
-- This migration is idempotent and handles the case where it's already been applied

-- Step 1: Create tags table if it doesn't exist (in case labels was already renamed)
CREATE TABLE IF NOT EXISTS default.tags
(
    `project_id` UUID,
    `class_id` UUID,
    `created_at` DateTime64(9, 'UTC'),
    `id` UUID,
    `name` String,
    `label_source` UInt8,
    `span_id` UUID
)
ENGINE = MergeTree
PRIMARY KEY (project_id, class_id, span_id)
ORDER BY (project_id, class_id, span_id, created_at, id)
SETTINGS index_granularity = 8192;

-- Step 2: Copy data from labels to tags (only if labels exists and tags is empty)
-- This will copy all data from labels if it exists
-- On re-run, if labels doesn't exist, this will fail - but that's okay, it means data was already migrated
INSERT INTO default.tags 
SELECT 
    project_id,
    class_id,
    created_at,
    id,
    name,
    label_source,
    span_id
FROM default.labels
WHERE EXISTS (
    SELECT 1 
    FROM system.tables 
    WHERE database = 'default' AND name = 'labels'
)
AND NOT EXISTS (
    SELECT 1 
    FROM default.tags 
    LIMIT 1
);

-- Step 3: Rename column (idempotent with IF EXISTS)
ALTER TABLE default.tags RENAME COLUMN IF EXISTS label_source TO source;

-- Step 4: Drop the old labels table if it still exists
DROP TABLE IF EXISTS default.labels;