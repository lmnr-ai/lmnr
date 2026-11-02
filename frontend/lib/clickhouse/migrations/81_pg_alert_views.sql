-- Live, project-scoped alert definitions through the PostgreSQL database engine.
-- The pg database and read grants are created at boot by postgres-engine.ts.
-- Keep the exposed columns in sync with the query-engine table registry.
DROP VIEW IF EXISTS alerts_v0;
CREATE VIEW alerts_v0
SQL SECURITY DEFINER
AS SELECT
    id,
    name,
    type,
    source_id AS signal_id,
    metadata,
    created_at
FROM pg.alerts
WHERE project_id = {project_id:UUID};

-- `email` is a subscribed member's address. Workspace members already see each other's emails.
DROP VIEW IF EXISTS alert_targets_v0;
CREATE VIEW alert_targets_v0
SQL SECURITY DEFINER
AS SELECT
    id,
    alert_id,
    type,
    channel_id,
    channel_name,
    email,
    created_at
FROM pg.alert_targets
WHERE project_id = {project_id:UUID};

DROP VIEW IF EXISTS alert_filters_v0;
CREATE VIEW alert_filters_v0
SQL SECURITY DEFINER
AS SELECT
    id,
    alert_id,
    value,
    created_at
FROM pg.alert_filters
WHERE project_id = {project_id:UUID};
