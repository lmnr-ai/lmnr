CREATE TABLE "oauth_signing_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kid" text NOT NULL,
	"algorithm" text DEFAULT 'RS256' NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"private_pkcs8" text NOT NULL,
	"private_pkcs8_nonce" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "oauth_signing_keys_kid_unique" UNIQUE("kid")
);
--> statement-breakpoint
CREATE INDEX "oauth_signing_keys_active_idx" ON "oauth_signing_keys" USING btree ("created_at" timestamptz_ops) WHERE "rotated_at" IS NULL;
--> statement-breakpoint
CREATE TABLE "oauth_device_codes" (
	"device_code" text PRIMARY KEY NOT NULL,
	"user_code" text NOT NULL,
	"client_id" text NOT NULL,
	"scope" text DEFAULT 'projects:rw' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_user_id" uuid,
	"approved_project_id" uuid,
	"requested_project_id" uuid,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	CONSTRAINT "oauth_device_codes_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
ALTER TABLE "oauth_device_codes" ADD CONSTRAINT "oauth_device_codes_approved_user_id_fkey" FOREIGN KEY ("approved_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_device_codes" ADD CONSTRAINT "oauth_device_codes_approved_project_id_fkey" FOREIGN KEY ("approved_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "oauth_device_codes_user_code_idx" ON "oauth_device_codes" USING btree ("user_code" text_ops);
--> statement-breakpoint
CREATE INDEX "oauth_device_codes_expires_at_idx" ON "oauth_device_codes" USING btree ("expires_at" timestamptz_ops);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_tokens" (
	"hash" text PRIMARY KEY NOT NULL,
	"family_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"client_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_family_idx" ON "oauth_refresh_tokens" USING btree ("family_id" uuid_ops);
--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_user_idx" ON "oauth_refresh_tokens" USING btree ("user_id" uuid_ops);
--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_expires_at_idx" ON "oauth_refresh_tokens" USING btree ("expires_at" timestamptz_ops);
