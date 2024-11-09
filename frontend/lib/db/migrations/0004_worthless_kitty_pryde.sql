CREATE TABLE IF NOT EXISTS "datapoint_to_span" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"datapoint_id" uuid NOT NULL,
	"span_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "datapoint_to_span_pkey" PRIMARY KEY("datapoint_id","span_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "labeling_queue_items" DROP CONSTRAINT "labelling_queue_data_queue_id_fkey";
--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "value" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "datapoint_to_span" ADD CONSTRAINT "datapoint_to_span_datapoint_id_fkey" FOREIGN KEY ("datapoint_id") REFERENCES "public"."dataset_datapoints"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "datapoint_to_span" ADD CONSTRAINT "datapoint_to_span_span_id_project_id_fkey" FOREIGN KEY ("span_id","project_id") REFERENCES "public"."spans"("span_id","project_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "labeling_queue_items" ADD CONSTRAINT "labelling_queue_items_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "public"."labeling_queues"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_scores_result_id_idx" ON "evaluation_scores" USING hash ("result_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_parent_span_id_project_id_start_time_end_time_idx" ON "spans" USING btree ("parent_span_id","project_id","start_time","end_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_project_id_trace_id_start_time_idx" ON "spans" USING btree ("project_id","trace_id","start_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_trace_id_start_time_idx" ON "spans" USING btree ("trace_id","start_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traces_id_project_id_start_time_times_not_null_idx" ON "traces" USING btree ("id","project_id","start_time" DESC NULLS FIRST) WHERE ((start_time IS NOT NULL) AND (end_time IS NOT NULL));--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_results_names_unique" UNIQUE("result_id","name");