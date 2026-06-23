ALTER TABLE "project_api_keys" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD CONSTRAINT "project_api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
