--> statement-breakpoint
CREATE TABLE "rollout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"params" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"name" text
);
--> statement-breakpoint
