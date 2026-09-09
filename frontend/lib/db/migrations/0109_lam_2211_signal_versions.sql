CREATE TABLE "signal_versions" (
	"project_id" uuid NOT NULL,
	"signal_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signal_versions_pkey" PRIMARY KEY("signal_id","version")
);
--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "signal_versions" ADD CONSTRAINT "signal_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_versions" ADD CONSTRAINT "signal_versions_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Stored verbatim; compare sorts set-valued arrays so this backfill can't look like an edit.
-- Newest trigger row per signal (created_at, id tiebreak — same as GET).
INSERT INTO "signal_versions" ("project_id", "signal_id", "version", "definition", "created_at")
SELECT s."project_id", s."id", 1,
       jsonb_build_object(
         'name', s."name",
         'prompt', s."prompt",
         'structuredOutputSchema', s."structured_output_schema",
         'trigger', COALESCE(st."value", '[{"column":"root_span_finished","operator":"eq","value":"true"}]'::jsonb),
         'filters', COALESCE(st."filters", '[]'::jsonb),
         'mode', CASE WHEN st."mode" = 0 THEN 'batch' ELSE 'realtime' END,
         'sampleRate', s."metadata"->'sampleRate',
         'disabled', COALESCE((s."metadata"->>'disabled')::boolean, false),
         'llmProfileId', to_jsonb(s."llm_profile_id"),
         'llmModel', to_jsonb(s."llm_model")
       ),
       s."created_at"
FROM "signals" s
LEFT JOIN LATERAL (
  SELECT "value", "filters", "mode"
  FROM "signal_triggers"
  WHERE "project_id" = s."project_id" AND "signal_id" = s."id"
  ORDER BY "created_at" DESC, "id" DESC
  LIMIT 1
) st ON true
ON CONFLICT DO NOTHING;