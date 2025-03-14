ALTER TABLE "labels" DROP CONSTRAINT "labels_span_id_class_id_user_id_key";--> statement-breakpoint
ALTER TABLE "label_classes" ADD COLUMN "color" text NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "project_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "label_classes" DROP COLUMN "value_map";--> statement-breakpoint
ALTER TABLE "labels" DROP COLUMN "value";--> statement-breakpoint
ALTER TABLE "label_classes" ADD CONSTRAINT "label_classes_project_id_name_key" UNIQUE("name","project_id");--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_span_id_class_id_key" UNIQUE("class_id","span_id");--> statement-breakpoint