DROP TABLE "datapoint_to_span" CASCADE;--> statement-breakpoint
DROP TABLE "pipeline_templates" CASCADE;--> statement-breakpoint
ALTER TABLE "traces_summaries" DROP CONSTRAINT "traces_summaries_trace_id_fkey";
