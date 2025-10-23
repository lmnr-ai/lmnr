RENAME TABLE labels TO tags;
ALTER TABLE tags RENAME COLUMN IF EXISTS label_source TO source;