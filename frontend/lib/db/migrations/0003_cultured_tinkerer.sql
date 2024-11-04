ALTER TABLE "labels" DROP CONSTRAINT "trace_tags_span_id_fkey";
--> statement-breakpoint
/* 
    [SOLVED]
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'spans'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

ALTER TABLE "spans" DROP CONSTRAINT "spans_pkey";--> statement-breakpoint
ALTER TABLE "spans" ADD COLUMN "project_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "spans" ADD CONSTRAINT "spans_pkey" PRIMARY KEY("span_id","project_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spans" ADD CONSTRAINT "spans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_project_id_idx" ON "spans" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "spans" ADD CONSTRAINT "unique_span_id_project_id" UNIQUE("span_id","project_id");