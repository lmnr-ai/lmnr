CREATE TABLE "evaluator_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluator_id" uuid NOT NULL,
	"span_id" uuid NOT NULL,
	"score" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluator_span_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluator_id" uuid NOT NULL,
	"span_path" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "evaluators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"evaluator_type" text NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "evaluator_span_paths" ADD CONSTRAINT "evaluator_span_paths_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "public"."evaluators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluators" ADD CONSTRAINT "evaluators_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
