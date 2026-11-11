-- Drops `channel_name` from SQL access (LAM-2526). Slack's privacy model forbids showing a private
-- channel's name to people who aren't in it, and SQL has no per-viewer Slack identity to check.
-- `channel_id` stays. Keep the exposed columns in sync with the query-engine table registry.
DROP VIEW IF EXISTS alert_targets_v0;
CREATE VIEW alert_targets_v0
SQL SECURITY DEFINER
AS SELECT
    id,
    alert_id,
    type,
    channel_id,
    email,
    created_at
FROM pg.alert_targets
WHERE project_id = {project_id:UUID};
