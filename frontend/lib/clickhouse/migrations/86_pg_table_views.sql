-- Live, project-scoped saved table views through the PostgreSQL database engine.
-- The pg database and read grants are created at boot by postgres-engine.ts.
-- Keep the exposed columns in sync with the query-engine table registry.
DROP VIEW IF EXISTS table_views_v0;
CREATE VIEW table_views_v0
SQL SECURITY DEFINER
AS SELECT
    id,
    resource,
    name,
    config,
    created_at,
    updated_at
FROM pg.table_views
WHERE project_id = {project_id:UUID};
