
CREATE TABLE "model_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" text NOT NULL,
	"costs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "model_costs_model_unique" UNIQUE("model")
);
