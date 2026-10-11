ALTER TABLE "llm_profiles" ADD CONSTRAINT "llm_profiles_workspace_id_id_key" UNIQUE("workspace_id","id");--> statement-breakpoint
CREATE TABLE "llm_feature_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" uuid,
	"feature_id" text NOT NULL,
	"llm_profile_id" uuid NOT NULL,
	"model_name" text NOT NULL,
	CONSTRAINT "llm_feature_routes_workspace_id_feature_id_key" UNIQUE NULLS NOT DISTINCT("workspace_id","feature_id")
);
--> statement-breakpoint
ALTER TABLE "llm_feature_routes" ADD CONSTRAINT "llm_feature_routes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_feature_routes" ADD CONSTRAINT "llm_feature_routes_workspace_profile_fkey" FOREIGN KEY ("workspace_id","llm_profile_id") REFERENCES "llm_profiles"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_feature_routes" ADD CONSTRAINT "llm_feature_routes_profile_model_fkey" FOREIGN KEY ("llm_profile_id","model_name") REFERENCES "llm_profile_models"("profile_id","name") ON DELETE restrict ON UPDATE no action;