CREATE TABLE IF NOT EXISTS "evaluation_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"score" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "labeling_queues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evaluation_results" ALTER COLUMN "scores" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "public"."evaluation_results"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "labeling_queues" ADD CONSTRAINT "labeling_queues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "evaluation_results" DROP COLUMN IF EXISTS "error";--> statement-breakpoint
ALTER TABLE "evaluations" DROP COLUMN IF EXISTS "score_names";--> statement-breakpoint
ALTER TABLE "evaluations" DROP COLUMN IF EXISTS "average_scores";