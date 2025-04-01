ALTER TABLE "subscription_tiers" RENAME COLUMN "events" TO "steps";--> statement-breakpoint
ALTER TABLE "subscription_tiers" RENAME COLUMN "extra_event_price" TO "extra_step_price";--> statement-breakpoint
ALTER TABLE "workspace_usage" RENAME COLUMN "event_count" TO "step_count";--> statement-breakpoint
ALTER TABLE "workspace_usage" RENAME COLUMN "event_count_since_reset" TO "step_count_since_reset";--> statement-breakpoint
ALTER TABLE "workspace_usage" RENAME COLUMN "prev_event_count" TO "prev_step_count";--> statement-breakpoint
ALTER TABLE "agent_messages" DROP CONSTRAINT "agent_message_to_user_fkey";
--> statement-breakpoint
ALTER TABLE "agent_messages" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "subscription_tiers" DROP COLUMN "num_workspaces";