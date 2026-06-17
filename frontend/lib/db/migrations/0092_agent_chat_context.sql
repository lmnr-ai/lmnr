ALTER TABLE "traces_agent_chats" RENAME TO "chat_sessions";--> statement-breakpoint
ALTER TABLE "traces_agent_messages" RENAME TO "chat_messages";--> statement-breakpoint
ALTER TABLE "chat_sessions" RENAME CONSTRAINT "traces_agent_chats_project_id_fkey" TO "chat_sessions_project_id_fkey";--> statement-breakpoint
ALTER TABLE "chat_messages" RENAME CONSTRAINT "traces_agent_messages_project_id_fkey" TO "chat_messages_project_id_fkey";--> statement-breakpoint
ALTER TABLE "chat_sessions" DROP COLUMN "trace_id";--> statement-breakpoint
ALTER TABLE "chat_messages" DROP COLUMN "trace_id";--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "context" jsonb DEFAULT '{}'::jsonb NOT NULL;