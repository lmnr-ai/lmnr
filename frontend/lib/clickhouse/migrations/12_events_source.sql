ALTER TABLE events
ADD COLUMN IF NOT EXISTS source LowCardinality(String) DEFAULT 'CODE';


DROP VIEW IF EXISTS events_v0;

CREATE VIEW IF NOT EXISTS default.events_v0 SQL SECURITY INVOKER AS
    SELECT
       events.id,
       events.span_id,
       events.name,
       events.timestamp,
       events.attributes,
       events.user_id,
       events.session_id,
       events.trace_id AS trace_id,
       events.source as source
   FROM default.events
   WHERE events.project_id = {project_id:UUID};
