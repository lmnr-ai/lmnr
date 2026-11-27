-- Live, project-scoped agents and agent versions through the PostgreSQL database engine.
-- The pg database and read grants are created at boot by postgres-engine.ts.
-- Keep the exposed columns in sync with the query-engine table registry.
-- `system_prompt` / `tool_definitions` are left out: they come from span input, which
-- PII masking covers, and these views take no access policy.
DROP VIEW IF EXISTS agents_v0;
CREATE VIEW agents_v0
SQL SECURITY DEFINER
AS SELECT
    id,
    name,
    agent_hash,
    release_mode,
    created_at
FROM pg.agents
WHERE project_id = {project_id:UUID};

-- `shown_version_hash` is the version a deleted one is shown under, and its own hash otherwise.
DROP VIEW IF EXISTS agent_versions_v0;
CREATE VIEW agent_versions_v0
SQL SECURITY DEFINER
AS SELECT
    id,
    agent_id,
    version_number,
    version_hash,
    ifNull(shown_version_hash, version_hash) AS shown_version_hash,
    deleted_at,
    created_at
FROM pg.agent_versions
WHERE project_id = {project_id:UUID};
