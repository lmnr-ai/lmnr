CREATE TABLE "debugger_session_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"type" text NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debugger_session_blocks" ADD CONSTRAINT "debugger_session_blocks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "debugger_session_blocks" ADD CONSTRAINT "debugger_session_blocks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "debugger_sessions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "debugger_session_blocks_session_id_idx" ON "debugger_session_blocks" USING btree ("session_id" uuid_ops);
