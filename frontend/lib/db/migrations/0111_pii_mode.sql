-- Custom SQL migration file, put your code below! --

-- projects.settings: replace the boolean `removePii` with `piiMode`
-- ("off" | "redact" | "dual"). `removePii: true` becomes "redact"; an already
-- present `piiMode` wins. Rows without the legacy key are untouched.
UPDATE "projects"
SET "settings" = ("settings" - 'removePii')
  || CASE
       WHEN NOT ("settings" ? 'piiMode') AND "settings"->>'removePii' = 'true'
         THEN '{"piiMode":"redact"}'::jsonb
       ELSE '{}'::jsonb
     END
WHERE "settings" ? 'removePii';
