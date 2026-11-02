-- Live, project-scoped dashboard definitions through the PostgreSQL database engine.
-- The pg database and read grants are created at boot by postgres-engine.ts.
-- Keep the exposed columns in sync with the query-engine table registry.
DROP VIEW IF EXISTS dashboards_v0;
CREATE VIEW dashboards_v0
SQL SECURITY DEFINER
AS SELECT
    id,
    name,
    created_at
FROM pg.dashboards
WHERE project_id = {project_id:UUID};

DROP VIEW IF EXISTS dashboard_charts_v0;
CREATE VIEW dashboard_charts_v0
SQL SECURITY DEFINER
AS SELECT
    id,
    dashboard_id,
    name,
    query,
    settings,
    created_at
FROM pg.dashboard_charts
WHERE project_id = {project_id:UUID};
