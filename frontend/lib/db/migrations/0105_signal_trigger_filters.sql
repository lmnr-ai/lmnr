ALTER TABLE "signal_triggers" ADD COLUMN "filters" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "signal_triggers" SET "filters" = COALESCE(
  (SELECT jsonb_agg(c) FROM jsonb_array_elements("value") AS c
   WHERE c->>'column' NOT IN ('root_span_finished', 'span_name')),
  '[]'::jsonb
) WHERE jsonb_typeof("value") = 'array';--> statement-breakpoint
UPDATE "signal_triggers" SET "value" = COALESCE(
  (SELECT jsonb_agg(c) FROM jsonb_array_elements("value") AS c
   WHERE c->>'column' IN ('root_span_finished', 'span_name')),
  '[{"column":"root_span_finished","operator":"eq","value":"true"}]'::jsonb
) WHERE jsonb_typeof("value") = 'array';
