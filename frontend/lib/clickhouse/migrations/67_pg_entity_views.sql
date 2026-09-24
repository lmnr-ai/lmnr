-- Live Postgres entity definitions via the `pg` PostgreSQL database engine.
-- ClickHouse stores nothing; every SELECT hits Postgres. The `pg` database is
-- created at boot (frontend/lib/clickhouse/postgres-engine.ts) from env vars,
-- not here — a SQL migration cannot interpolate credentials, and putting them
-- in this file would trip the checksum guard on rotation.
--
-- Do NOT query `pg.*` from the query API. The engine mirrors the whole
-- schema; these views are the allowlist. Explicit columns so a new Postgres
-- column never leaks. SQL SECURITY DEFINER so the query-API user can SELECT
-- the view without SELECT on `pg`.

-- `prompt`, `structured_output_schema` and `metadata` are unbounded text/jsonb.
-- Safe to expose because ClickHouse prunes unselected columns out of the query
-- it sends Postgres, and `signals` is a handful of rows per project.
DROP VIEW IF EXISTS signals_v0;
CREATE VIEW signals_v0
SQL SECURITY DEFINER
AS SELECT
    id,
    name,
    prompt,
    structured_output_schema,
    metadata,
    llm_model,
    created_at,
    version
FROM pg.signals
WHERE project_id = {project_id:UUID};

DROP VIEW IF EXISTS evaluations_v0;
CREATE VIEW evaluations_v0
SQL SECURITY DEFINER
AS SELECT
    id,
    name,
    group_id,
    created_at
FROM pg.evaluations
WHERE project_id = {project_id:UUID};

DROP VIEW IF EXISTS datasets_v0;
CREATE VIEW datasets_v0
SQL SECURITY DEFINER
AS SELECT
    id,
    name,
    created_at
FROM pg.datasets
WHERE project_id = {project_id:UUID};
