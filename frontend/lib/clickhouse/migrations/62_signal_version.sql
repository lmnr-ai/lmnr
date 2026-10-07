-- Stamp each event / run with the signal definition version it ran under.
-- Named `signal_version`, NOT `version`: signal_runs is a
-- ReplacingMergeTree(updated_at) and a bare `version` column next to an RMT
-- version column is a trap for the next reader.
--
-- DEFAULT 0 means "predates versioning" and renders as an em dash. Old rows are
-- deliberately NOT backfilled to 1: the v1 minted by the Postgres migration is
-- today's definition, and an old event may predate several edits of it.
-- Both ALTERs are metadata-only, so neither rewrites the table.
ALTER TABLE signal_events ADD COLUMN IF NOT EXISTS signal_version UInt32 DEFAULT 0;
ALTER TABLE signal_runs ADD COLUMN IF NOT EXISTS signal_version UInt32 DEFAULT 0;

-- Recreate the views to expose the new column. Bodies are otherwise unchanged
-- from migrations 40 (both events views) and 59 (runs).
DROP VIEW IF EXISTS default.signal_events_v0;
CREATE VIEW signal_events_v0
SQL SECURITY INVOKER
AS
SELECT * FROM (
    SELECT
        id,
        project_id,
        signal_id,
        trace_id,
        run_id,
        name,
        payload,
        timestamp,
        severity,
        summary,
        signal_version,
        ca.clusters AS clusters
    FROM default.signal_events
    LEFT JOIN
    (
        SELECT
            e.project_id,
            e.event_id,
            arrayDistinct(groupArray(e.cluster_id)) AS clusters
        FROM events_to_clusters e FINAL
        JOIN signal_event_clusters c FINAL ON e.project_id = c.project_id AND e.cluster_id = c.id AND c.level > 0
        PREWHERE e.project_id = {project_id:UUID}
        GROUP BY
            e.project_id,
            event_id
    ) AS ca ON (signal_events.project_id = ca.project_id) AND (signal_events.id = ca.event_id)
WHERE signal_events.project_id = {project_id:UUID});

DROP VIEW IF EXISTS default.signal_events_all_v0;
CREATE VIEW signal_events_all_v0
SQL SECURITY INVOKER
AS
SELECT * FROM (
    SELECT
        id,
        project_id,
        signal_id,
        trace_id,
        run_id,
        name,
        payload,
        timestamp,
        severity,
        summary,
        signal_version,
        ca.clusters AS clusters
    FROM default.signal_events
    LEFT JOIN
    (
        SELECT
            e.project_id,
            e.event_id,
            arrayDistinct(groupArray(e.cluster_id)) AS clusters
        FROM events_to_clusters e FINAL
        PREWHERE e.project_id = {project_id:UUID}
        GROUP BY
            e.project_id,
            event_id
    ) AS ca ON (signal_events.project_id = ca.project_id) AND (signal_events.id = ca.event_id)
WHERE signal_events.project_id = {project_id:UUID});

DROP VIEW IF EXISTS signal_runs_v0;
CREATE VIEW signal_runs_v0 SQL SECURITY INVOKER AS
    SELECT
        project_id,
        signal_id,
        job_id,
        trigger_id,
        run_id,
        trace_id,
        error_message,
        multiIf(
            status = 0, 'PROCESSING',
            status = 1, 'COMPLETED',
            status = 2, 'FAILED',
            status = 3, 'PENDING',
            'UNKNOWN'
        ) AS status,
        multiIf(mode = 0, 'BATCH', mode = 1, 'REALTIME', 'UNKNOWN') AS mode,
        event_id,
        updated_at,
        input_tokens,
        cache_read_tokens,
        output_tokens,
        signal_version
    FROM signal_runs FINAL
    WHERE project_id={project_id:UUID};
