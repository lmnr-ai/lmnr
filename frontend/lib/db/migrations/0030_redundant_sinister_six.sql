ALTER TABLE "agent_sessions" RENAME COLUMN "status" TO "machine_status";--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "agent_status" text DEFAULT 'idle' NOT NULL;