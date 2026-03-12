ALTER TABLE "traces" ADD COLUMN IF NOT EXISTS "root_span_input" text;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN IF NOT EXISTS "root_span_output" text;--> statement-breakpoint