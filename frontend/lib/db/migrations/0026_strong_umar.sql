CREATE TYPE "public"."agent_machine_status" AS ENUM('not_started', 'running', 'paused', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."agent_message_type" AS ENUM('user', 'assistant', 'step');--> statement-breakpoint
CREATE TABLE "user_cookies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"cookies" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_messages" ALTER COLUMN "message_type" DROP DEFAULT;--> statement-breakpoint
-- ALTER TABLE "agent_messages" ALTER COLUMN "message_type" SET DATA TYPE agent_message_type;--> statement-breakpoint
ALTER TABLE "agent_messages" ALTER COLUMN "message_type" SET DATA TYPE agent_message_type USING message_type::agent_message_type;
ALTER TABLE "agent_sessions" ALTER COLUMN "state" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "state" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "chat_name" text DEFAULT 'New chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "user_cookies" ADD CONSTRAINT "user_cookies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."agent_sessions"("chat_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "agent_messages_chat_id_created_at_idx" ON "agent_messages" USING btree ("chat_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "agent_sessions_created_at_idx" ON "agent_sessions" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "agent_sessions_updated_at_idx" ON "agent_sessions" USING btree ("updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "agent_sessions_user_id_idx" ON "agent_sessions" USING hash ("user_id" uuid_ops);