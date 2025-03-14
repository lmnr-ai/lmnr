CREATE TABLE "agent_messages" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message_type" text DEFAULT '' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chat_id" uuid PRIMARY KEY NOT NULL,
	"cdp_url" text NOT NULL,
	"vnc_url" text NOT NULL,
	"machine_id" text,
	"state" jsonb
);
--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_message_to_user_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "label_classes" ADD CONSTRAINT "label_classes_name_project_id_unique" UNIQUE("name","project_id");