ALTER TABLE "render_templates" ADD COLUMN "scope" text DEFAULT 'span' NOT NULL;--> statement-breakpoint
ALTER TABLE "render_templates" ADD COLUMN "where_clause" text;
