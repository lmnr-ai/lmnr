ALTER TABLE "agent_messages" RENAME COLUMN "chat_id" TO "session_id";--> statement-breakpoint
ALTER TABLE "agent_sessions" RENAME COLUMN "chat_id" TO "session_id";--> statement-breakpoint
ALTER TABLE "agent_messages" DROP CONSTRAINT "agent_messages_chat_id_fkey";
--> statement-breakpoint
DROP INDEX "agent_messages_chat_id_created_at_idx";--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("session_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "agent_messages_session_id_created_at_idx" ON "agent_messages" USING btree ("created_at" timestamptz_ops,"session_id" uuid_ops);