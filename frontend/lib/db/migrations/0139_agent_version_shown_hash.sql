ALTER TABLE "agent_versions" ADD COLUMN "shown_version_hash" text;--> statement-breakpoint
UPDATE "agent_versions" AS d
SET "shown_version_hash" = (
  SELECT s."version_hash"
  FROM "agent_versions" AS s
  WHERE s."agent_id" = d."agent_id" AND s."deleted_at" IS NULL AND s."version_number" < d."version_number"
  ORDER BY s."version_number" DESC
  LIMIT 1
)
WHERE d."deleted_at" IS NOT NULL;
