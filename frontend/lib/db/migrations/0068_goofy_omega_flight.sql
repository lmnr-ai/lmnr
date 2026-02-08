--> statement-breakpoint
CREATE TABLE "shared_evals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid DEFAULT gen_random_uuid() NOT NULL
);