CREATE TABLE "cli_login_grants" (
	"session_id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"client_info" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_user_id" uuid,
	"approved_project_id" uuid,
	"approved_workspace_id" uuid,
	"encrypted_payload" text,
	"encrypted_nonce" text,
	"ephemeral_public_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cli_login_grants" ADD CONSTRAINT "cli_login_grants_approved_user_id_fkey" FOREIGN KEY ("approved_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cli_login_grants" ADD CONSTRAINT "cli_login_grants_approved_project_id_fkey" FOREIGN KEY ("approved_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cli_login_grants_expires_at_idx" ON "cli_login_grants" USING btree ("expires_at" timestamptz_ops);
