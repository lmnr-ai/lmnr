CREATE TABLE "span_rendering_keys" (
	"project_id" uuid NOT NULL,
	"schema_fingerprint" text NOT NULL,
	"mustache_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "span_rendering_keys_pkey" PRIMARY KEY("project_id","schema_fingerprint")
);
--> statement-breakpoint
ALTER TABLE "span_rendering_keys" ADD CONSTRAINT "span_rendering_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint