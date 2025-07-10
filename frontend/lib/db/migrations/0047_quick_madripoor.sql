ALTER TABLE "evaluator_scores" ALTER COLUMN "evaluator_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluator_scores" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluator_scores" ADD COLUMN "source" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluator_scores" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;