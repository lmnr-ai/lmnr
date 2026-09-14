-- Custom SQL migration file, put your code below! --

-- projects.settings: add `piiMode` ("off" | "redact" | "dual") next to the
-- boolean `removePii`. `removePii: true` becomes "redact"; an already present
-- `piiMode` wins. `removePii` is deliberately left in place: this runs at
-- frontend boot, and an app-server pod still on the previous binary reads
-- only `removePii` until the rollout completes. Both readers ignore it once
-- `piiMode` is set; a later migration can drop the key.
UPDATE "projects"
SET "settings" = "settings" || '{"piiMode":"redact"}'::jsonb
WHERE "settings"->>'removePii' = 'true'
  AND NOT ("settings" ? 'piiMode');
