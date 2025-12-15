ALTER TABLE "event_clusters" ALTER COLUMN "event_source" SET DEFAULT 'SEMANTIC';--> statement-breakpoint
ALTER TABLE "playgrounds" ALTER COLUMN "model_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "playgrounds" ALTER COLUMN "model_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_api_keys" ALTER COLUMN "value" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "project_api_keys" ALTER COLUMN "value" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_api_keys" ALTER COLUMN "shorthand" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "project_api_keys" ALTER COLUMN "shorthand" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_api_keys" ALTER COLUMN "hash" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "project_api_keys" ALTER COLUMN "hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "stripe_product_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "stripe_product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_deployments" ALTER COLUMN "private_key" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "workspace_deployments" ALTER COLUMN "private_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_deployments" ALTER COLUMN "private_key_nonce" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "workspace_deployments" ALTER COLUMN "private_key_nonce" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_deployments" ALTER COLUMN "public_key" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "workspace_deployments" ALTER COLUMN "public_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_deployments" ALTER COLUMN "data_plane_url" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "workspace_deployments" ALTER COLUMN "data_plane_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_deployments" ALTER COLUMN "data_plane_url_nonce" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "workspace_deployments" ALTER COLUMN "data_plane_url_nonce" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ALTER COLUMN "email" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ALTER COLUMN "email" DROP NOT NULL;