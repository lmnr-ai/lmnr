ALTER TABLE "traces" ADD COLUMN "cache_read_input_tokens" bigint;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "cache_creation_input_tokens" bigint;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "reasoning_tokens" bigint;
