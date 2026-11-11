CREATE TABLE "slack_user_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"slack_user_id" text NOT NULL,
	CONSTRAINT "slack_user_links_user_id_team_id_key" UNIQUE("user_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "slack_user_links" ADD CONSTRAINT "slack_user_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;