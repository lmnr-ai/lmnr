CREATE TABLE "instance_license" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"trial_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"license_key" text,
	"license_key_nonce" text,
	"updated_at" timestamp with time zone,
	"updated_by" uuid,
	CONSTRAINT "instance_license_singleton" CHECK (id = 1)
);
--> statement-breakpoint
-- Seeding at migration time starts the trial when an instance first runs a licensing-aware version.
INSERT INTO "instance_license" ("id") VALUES (1) ON CONFLICT DO NOTHING;
