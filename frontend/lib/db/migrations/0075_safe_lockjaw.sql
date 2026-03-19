ALTER TABLE "signal_jobs" ADD COLUMN "mode" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "signal_triggers" ADD COLUMN "mode" smallint DEFAULT 0 NOT NULL;