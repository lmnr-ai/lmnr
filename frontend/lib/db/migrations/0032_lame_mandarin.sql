CREATE TABLE "agent_chats" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_name" text DEFAULT 'New chat' NOT NULL,
	"user_id" uuid NOT NULL,
	"machine_status" "agent_machine_status" DEFAULT 'not_started',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP CONSTRAINT "agent_sessions_user_id_fkey";
--> statement-breakpoint
DROP INDEX "agent_sessions_user_id_idx";--> statement-breakpoint
ALTER TABLE "agent_messages" ADD COLUMN "trace_id" uuid;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "agent_session_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_chats" ADD CONSTRAINT "agent_chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chats" ADD CONSTRAINT "agent_chats_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("session_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "agent_chats_created_at_idx" ON "agent_chats" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "agent_chats_updated_at_idx" ON "agent_chats" USING btree ("updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "agent_chats_user_id_idx" ON "agent_chats" USING hash ("user_id" uuid_ops);--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP COLUMN "chat_name";--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP COLUMN "machine_status";