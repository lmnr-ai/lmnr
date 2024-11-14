ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluation_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pipeline_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "traces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "playgrounds" ADD COLUMN "prompt_messages" jsonb DEFAULT '[{"role":"user","content":""}]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "playgrounds" ADD COLUMN "model_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "playgrounds" ADD COLUMN "output_schema" text;--> statement-breakpoint
