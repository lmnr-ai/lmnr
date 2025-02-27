ALTER TABLE "labels" DROP CONSTRAINT "labels_span_id_class_id_user_id_key";--> statement-breakpoint
ALTER TABLE "label_classes" ADD COLUMN "color" text;
ALTER TABLE "label_classes" DROP COLUMN "value_map";
ALTER TABLE "labels" DROP COLUMN "value";
ALTER TABLE "labels" ADD CONSTRAINT "labels_span_id_class_id_key" UNIQUE("class_id","span_id");