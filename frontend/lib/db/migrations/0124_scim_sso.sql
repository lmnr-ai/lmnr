CREATE TABLE "scim_connection_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"connection_key" text NOT NULL,
	"provisioning_domain_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"decommissioned_at" timestamp with time zone,
	"decommission_status" text DEFAULT 'active' NOT NULL,
	"decommission_cursor_user_id" text,
	"decommission_reconciled_user_count" integer DEFAULT 0 NOT NULL,
	"decommission_batch_count" integer DEFAULT 0 NOT NULL,
	"decommission_revision" integer DEFAULT 0 NOT NULL,
	"decommission_completed_at" timestamp with time zone,
	"decommission_lease_id" text,
	"decommission_lease_expires_at" timestamp with time zone,
	CONSTRAINT "scim_connection_bindings_connection_key_key" UNIQUE("connection_key")
);
--> statement-breakpoint
CREATE TABLE "scim_group_members" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"group_id" text NOT NULL,
	"scim_user_id" text NOT NULL,
	"membership_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scim_group_members_membership_key_key" UNIQUE("membership_key")
);
--> statement-breakpoint
CREATE TABLE "scim_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"provisioning_domain_id" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"display_name" text NOT NULL,
	"display_name_key" text NOT NULL,
	"external_id" text,
	"external_id_key" text,
	"order_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scim_groups_display_name_key_key" UNIQUE("display_name_key"),
	CONSTRAINT "scim_groups_external_id_key_key" UNIQUE("external_id_key"),
	CONSTRAINT "scim_groups_order_key_key" UNIQUE("order_key")
);
--> statement-breakpoint
CREATE TABLE "scim_identity_tombstones" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"provisioning_domain_id" text NOT NULL,
	"external_id" text NOT NULL,
	"external_id_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"profile" text NOT NULL,
	"deleted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scim_identity_tombstones_external_id_key_key" UNIQUE("external_id_key")
);
--> statement-breakpoint
CREATE TABLE "scim_projection_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"provisioning_domain_id" text NOT NULL,
	"scim_user_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"source_value" text,
	"role" text NOT NULL,
	"grant_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scim_projection_grants_grant_key_key" UNIQUE("grant_key")
);
--> statement-breakpoint
CREATE TABLE "scim_subjects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_source_id" text,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scim_subjects_user_id_key" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "scim_users" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"provisioning_domain_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_user_key" text NOT NULL,
	"user_name" text NOT NULL,
	"user_name_key" text NOT NULL,
	"primary_email" text NOT NULL,
	"work_email_value_index" text NOT NULL,
	"email_value_index" text NOT NULL,
	"display_name" text NOT NULL,
	"formatted_name" text NOT NULL,
	"given_name" text,
	"family_name" text,
	"serialized_emails" text NOT NULL,
	"serialized_attributes" text,
	"external_id" text,
	"external_id_key" text,
	"active" boolean NOT NULL,
	"order_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scim_users_connection_user_key_key" UNIQUE("connection_user_key"),
	CONSTRAINT "scim_users_user_name_key_key" UNIQUE("user_name_key"),
	CONSTRAINT "scim_users_external_id_key_key" UNIQUE("external_id_key"),
	CONSTRAINT "scim_users_order_key_key" UNIQUE("order_key")
);
--> statement-breakpoint
CREATE TABLE "sso_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" uuid,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain" text NOT NULL,
	CONSTRAINT "sso_providers_provider_id_key" UNIQUE("provider_id")
);
--> statement-breakpoint
ALTER TABLE "scim_group_members" ADD CONSTRAINT "scim_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "scim_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_group_members" ADD CONSTRAINT "scim_group_members_scim_user_id_fkey" FOREIGN KEY ("scim_user_id") REFERENCES "scim_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_identity_tombstones" ADD CONSTRAINT "scim_identity_tombstones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_projection_grants" ADD CONSTRAINT "scim_projection_grants_scim_user_id_fkey" FOREIGN KEY ("scim_user_id") REFERENCES "scim_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_projection_grants" ADD CONSTRAINT "scim_projection_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_subjects" ADD CONSTRAINT "scim_subjects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_users" ADD CONSTRAINT "scim_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_providers" ADD CONSTRAINT "sso_providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scim_connection_bindings_connection_id_idx" ON "scim_connection_bindings" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "scim_group_members_connection_id_idx" ON "scim_group_members" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "scim_group_members_group_id_idx" ON "scim_group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "scim_group_members_scim_user_id_idx" ON "scim_group_members" USING btree ("scim_user_id");--> statement-breakpoint
CREATE INDEX "scim_groups_connection_id_idx" ON "scim_groups" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "scim_groups_provisioning_domain_id_idx" ON "scim_groups" USING btree ("provisioning_domain_id");--> statement-breakpoint
CREATE INDEX "scim_identity_tombstones_connection_id_idx" ON "scim_identity_tombstones" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "scim_identity_tombstones_provisioning_domain_id_idx" ON "scim_identity_tombstones" USING btree ("provisioning_domain_id");--> statement-breakpoint
CREATE INDEX "scim_identity_tombstones_user_id_idx" ON "scim_identity_tombstones" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scim_projection_grants_connection_id_idx" ON "scim_projection_grants" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "scim_projection_grants_provisioning_domain_id_idx" ON "scim_projection_grants" USING btree ("provisioning_domain_id");--> statement-breakpoint
CREATE INDEX "scim_projection_grants_scim_user_id_idx" ON "scim_projection_grants" USING btree ("scim_user_id");--> statement-breakpoint
CREATE INDEX "scim_projection_grants_user_id_idx" ON "scim_projection_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scim_subjects_profile_source_id_idx" ON "scim_subjects" USING btree ("profile_source_id");--> statement-breakpoint
CREATE INDEX "scim_users_connection_id_idx" ON "scim_users" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "scim_users_provisioning_domain_id_idx" ON "scim_users" USING btree ("provisioning_domain_id");--> statement-breakpoint
CREATE INDEX "scim_users_user_id_idx" ON "scim_users" USING btree ("user_id");