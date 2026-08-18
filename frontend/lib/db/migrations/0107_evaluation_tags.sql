ALTER TABLE "evaluations" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluations_tags_gin_idx" ON "evaluations" USING gin ("tags");--> statement-breakpoint
-- The first cut of this migration (feature branch only, never merged or deployed)
-- put tags in an `evaluation_tags` join table. Fold anything it collected into
-- the new column and drop it, so a checkout that ran that version converges.
DO $$
BEGIN
  IF to_regclass('evaluation_tags') IS NOT NULL THEN
    EXECUTE $q$
      UPDATE evaluations e
      SET tags = sub.names
      FROM (
        SELECT evaluation_id, array_agg(name ORDER BY created_at) AS names
        FROM evaluation_tags
        GROUP BY evaluation_id
      ) sub
      WHERE e.id = sub.evaluation_id AND e.tags = '{}'
    $q$;
    EXECUTE 'DROP TABLE evaluation_tags';
  END IF;
END $$;
