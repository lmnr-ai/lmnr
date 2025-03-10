ALTER TABLE "label_classes" DROP CONSTRAINT "label_classes_project_id_name_key";--> statement-breakpoint
ALTER TABLE "labels" DROP CONSTRAINT "trace_tags_type_id_fkey";
--> statement-breakpoint
ALTER TABLE "label_classes" ALTER COLUMN "color" SET DEFAULT 'rgb(190, 194, 200)';--> statement-breakpoint
ALTER TABLE "label_classes" ADD CONSTRAINT "label_classes_project_id_id_key" UNIQUE("id","project_id");--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_class_id_project_id_fkey" FOREIGN KEY ("class_id","project_id") REFERENCES "public"."label_classes"("id","project_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_span_id_class_id_user_id_key" UNIQUE("class_id","span_id","user_id");--> statement-breakpoint