
CREATE TABLE IF NOT EXISTS "custom_model_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text,
	"model" text NOT NULL,
	"costs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "custom_model_costs_project_id_model_unique" UNIQUE("project_id", "model")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'custom_model_costs_project_id_fkey'
  ) THEN
    ALTER TABLE "custom_model_costs" ADD CONSTRAINT "custom_model_costs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
