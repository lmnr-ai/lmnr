-- Drop the tool-definition versioning tables (migration 74). They fed the
-- legacy checkpoints pipeline, which agent versioning replaced; nothing
-- writes or reads them anymore.
DROP TABLE IF EXISTS tool_definition_versions;
DROP TABLE IF EXISTS tool_definition_version_defs;
