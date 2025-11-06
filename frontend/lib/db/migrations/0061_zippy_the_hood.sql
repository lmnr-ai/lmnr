ALTER TABLE "tag_classes" DROP CONSTRAINT "tag_classes_name_project_id_unique";--> statement-breakpoint
ALTER TABLE "event_definitions" DROP CONSTRAINT "event_definitions_project_id_fkey";
--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD COLUMN "is_ingest_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tag_classes" DROP COLUMN "evaluator_runnable_graph";--> statement-breakpoint
ALTER TABLE "tag_classes" DROP COLUMN "pipeline_version_id";--> statement-breakpoint
ALTER TABLE "tags" DROP COLUMN "class_id";--> statement-breakpoint
ALTER TABLE "tag_classes" ADD CONSTRAINT "label_classes_name_project_id_unique" UNIQUE("name","project_id");--> statement-breakpoint
