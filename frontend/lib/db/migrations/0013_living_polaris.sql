ALTER TABLE "spans" DROP CONSTRAINT "spans_project_id_fkey";
--> statement-breakpoint
ALTER TABLE "spans" ADD CONSTRAINT "spans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "label_classes" DROP COLUMN "label_type";--> statement-breakpoint
DROP TYPE "public"."label_type";