CREATE TABLE "custom_model_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"model" text NOT NULL,
	"costs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "custom_model_costs_project_id_provider_model_unique" UNIQUE("project_id","provider","model")
);
--> statement-breakpoint
ALTER TABLE "custom_model_costs" ADD CONSTRAINT "custom_model_costs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;
