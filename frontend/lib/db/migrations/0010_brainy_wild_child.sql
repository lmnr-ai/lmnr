CREATE TABLE IF NOT EXISTS "old_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"span_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"template_id" uuid NOT NULL,
	"source" "event_source" NOT NULL,
	"metadata" jsonb,
	"value" jsonb NOT NULL,
	"data" text,
	"inputs" jsonb
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_template_id_fkey";
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "project_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "old_events" ADD CONSTRAINT "events_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."event_templates"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_span_id_project_id_fkey" FOREIGN KEY ("span_id","project_id") REFERENCES "public"."spans"("span_id","project_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "template_id";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "source";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "metadata";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "value";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "data";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "inputs";