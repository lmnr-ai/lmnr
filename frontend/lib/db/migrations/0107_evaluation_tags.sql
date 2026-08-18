CREATE TABLE "evaluation_tags" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "evaluation_tags_pkey" PRIMARY KEY("evaluation_id","name")
);
--> statement-breakpoint
ALTER TABLE "evaluation_tags" ADD CONSTRAINT "evaluation_tags_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "evaluation_tags" ADD CONSTRAINT "evaluation_tags_name_project_id_fkey" FOREIGN KEY ("name","project_id") REFERENCES "tag_classes"("name","project_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "evaluation_tags_project_id_name_idx" ON "evaluation_tags" USING btree ("project_id" uuid_ops,"name" text_ops);
