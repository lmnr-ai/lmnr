--> statement-breakpoint
ALTER TABLE "shared_traces" ALTER COLUMN "project_id" DROP DEFAULT;--> statement-breakpoint
DROP INDEX "traces_trace_type_idx";--> statement-breakpoint
ALTER TABLE "traces" ALTER COLUMN "trace_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "traces" ALTER COLUMN "trace_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "num_spans" bigint;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "top_span_name" text;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "top_span_type" smallint;--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "type" smallint;--> statement-breakpoint
ALTER TABLE "traces" ADD CONSTRAINT "traces_project_id_id_unique" UNIQUE("id","project_id");--> statement-breakpoint
