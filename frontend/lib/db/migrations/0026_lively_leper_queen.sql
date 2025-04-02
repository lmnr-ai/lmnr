CREATE TYPE "public"."agent_machine_status" AS ENUM('not_started', 'running', 'paused', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."agent_message_type" AS ENUM('user', 'assistant', 'step');--> statement-breakpoint
CREATE TABLE "agent_chats" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_name" text DEFAULT 'New chat' NOT NULL,
	"user_id" uuid NOT NULL,
	"machine_status" "agent_machine_status" DEFAULT 'not_started',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_cookies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"cookies" text NOT NULL,
	"nonce" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_messages" RENAME COLUMN "chat_id" TO "session_id";--> statement-breakpoint
ALTER TABLE "agent_sessions" RENAME COLUMN "chat_id" TO "session_id";--> statement-breakpoint
ALTER TABLE "subscription_tiers" RENAME COLUMN "events" TO "steps";--> statement-breakpoint
ALTER TABLE "subscription_tiers" RENAME COLUMN "extra_event_price" TO "extra_step_price";--> statement-breakpoint
ALTER TABLE "workspace_usage" RENAME COLUMN "event_count" TO "step_count";--> statement-breakpoint
ALTER TABLE "workspace_usage" RENAME COLUMN "event_count_since_reset" TO "step_count_since_reset";--> statement-breakpoint
ALTER TABLE "workspace_usage" RENAME COLUMN "prev_event_count" TO "prev_step_count";--> statement-breakpoint
ALTER TABLE "agent_messages" DROP CONSTRAINT "agent_message_to_user_fkey";
--> statement-breakpoint
DROP INDEX "spans_project_id_trace_id_start_time_idx";--> statement-breakpoint
DROP INDEX "spans_root_project_id_start_time_end_time_trace_id_idx";--> statement-breakpoint
DROP INDEX "traces_id_project_id_start_time_times_not_null_idx";--> statement-breakpoint
DROP INDEX "traces_project_id_trace_type_start_time_end_time_idx";--> statement-breakpoint
ALTER TABLE "agent_messages" ALTER COLUMN "message_type" SET DATA TYPE agent_message_type;--> statement-breakpoint
ALTER TABLE "agent_messages" ALTER COLUMN "message_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "cdp_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "vnc_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "id" SET MAXVALUE 9223372036854775000;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD COLUMN "trace_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "agent_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "agent_session_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_chats" ADD CONSTRAINT "agent_chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chats" ADD CONSTRAINT "agent_chats_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("session_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_cookies" ADD CONSTRAINT "user_cookies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "agent_chats_created_at_idx" ON "agent_chats" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "agent_chats_updated_at_idx" ON "agent_chats" USING btree ("updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "agent_chats_user_id_idx" ON "agent_chats" USING hash ("user_id" uuid_ops);--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("session_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "agent_messages_session_id_created_at_idx" ON "agent_messages" USING btree ("created_at" timestamptz_ops,"session_id" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "agent_sessions_created_at_idx" ON "agent_sessions" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "agent_sessions_updated_at_idx" ON "agent_sessions" USING btree ("updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "spans_project_id_trace_id_start_time_idx" ON "spans" USING btree ("project_id" uuid_ops,"trace_id" uuid_ops,"start_time" uuid_ops);--> statement-breakpoint
CREATE INDEX "spans_root_project_id_start_time_end_time_trace_id_idx" ON "spans" USING btree ("project_id" uuid_ops,"start_time" timestamptz_ops,"end_time" uuid_ops,"trace_id" timestamptz_ops) WHERE (parent_span_id IS NULL);--> statement-breakpoint
CREATE INDEX "traces_id_project_id_start_time_times_not_null_idx" ON "traces" USING btree ("id" timestamptz_ops,"project_id" uuid_ops,"start_time" timestamptz_ops) WHERE ((start_time IS NOT NULL) AND (end_time IS NOT NULL));--> statement-breakpoint
CREATE INDEX "traces_project_id_trace_type_start_time_end_time_idx" ON "traces" USING btree ("project_id" timestamptz_ops,"start_time" uuid_ops,"end_time" timestamptz_ops) WHERE ((trace_type = 'DEFAULT'::trace_type) AND (start_time IS NOT NULL) AND (end_time IS NOT NULL));--> statement-breakpoint
ALTER TABLE "agent_messages" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "subscription_tiers" DROP COLUMN "num_workspaces";--> statement-breakpoint
