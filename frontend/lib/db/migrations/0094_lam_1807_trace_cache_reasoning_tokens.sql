ALTER TABLE "traces" ADD COLUMN "cache_read_input_tokens" bigint DEFAULT '0';--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "cache_creation_input_tokens" bigint DEFAULT '0';--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "reasoning_tokens" bigint DEFAULT '0';
