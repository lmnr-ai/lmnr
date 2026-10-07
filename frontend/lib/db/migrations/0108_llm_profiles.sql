CREATE TABLE "llm_profile_models" (
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_profile_models_pkey" PRIMARY KEY("profile_id","name")
);
--> statement-breakpoint
CREATE TABLE "llm_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets" jsonb NOT NULL,
	CONSTRAINT "llm_profiles_workspace_id_name_key" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "llm_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "llm_model" text;--> statement-breakpoint
ALTER TABLE "llm_profile_models" ADD CONSTRAINT "llm_profile_models_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "llm_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_profiles" ADD CONSTRAINT "llm_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_llm_profile_model_fkey" FOREIGN KEY ("llm_profile_id","llm_model") REFERENCES "llm_profile_models"("profile_id","name") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_llm_profile_pair_check" CHECK ((llm_profile_id IS NULL) = (llm_model IS NULL));
