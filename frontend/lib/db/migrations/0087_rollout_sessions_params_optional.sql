ALTER TABLE "rollout_sessions" ALTER COLUMN "params" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "rollout_sessions" ALTER COLUMN "params" DROP NOT NULL;
