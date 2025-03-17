ALTER TABLE "agent_sessions" ALTER COLUMN "chat_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "cdp_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "vnc_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "state" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "state" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "chat_name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "chat_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
