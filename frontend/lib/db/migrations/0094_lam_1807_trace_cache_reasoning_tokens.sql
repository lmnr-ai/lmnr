ALTER TABLE "traces" ADD COLUMN "cache_read_input_tokens" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "reasoning_tokens" bigint DEFAULT '0' NOT NULL;
