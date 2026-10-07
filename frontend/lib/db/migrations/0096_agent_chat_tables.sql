-- Agent chat schema + legacy re-key migration (squash of branch-only rename + channels + conversation-key).
-- Transforms the shipped traces_agent_* tables (migration 0052) into the final chat_* tables. The id is a
-- surrogate uuid; UI conversations are deduped per (project, user, trace) by the partial unique index, so
-- the old '<userId>:<traceId>' text key is gone. trace_id is nullable (MCP/CLI/global chats have none).
-- The old trace-chat UI only surfaced the LATEST chat per trace, so we keep just that one and fan it out to
-- every member of the trace's workspace; older chats are discarded. Persisted `parts` load as-is.
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"channel_type" text DEFAULT 'ui' NOT NULL,
	"workspace_id" uuid,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"trace_id" uuid
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"chat_id" uuid NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
-- One UI conversation per (project, user, trace). Partial: MCP/CLI/global rows (trace_id NULL) are exempt.
CREATE UNIQUE INDEX "chat_sessions_project_user_trace_key" ON "chat_sessions" USING btree ("project_id","user_id","trace_id") WHERE "chat_sessions"."trace_id" is not null;--> statement-breakpoint
-- Backfill: latest chat per (project, trace), fanned to each workspace member, one minted uuid per (member, trace).
WITH "latest" AS (
	SELECT DISTINCT ON (c."project_id", c."trace_id") c."id" AS old_chat_id, c."project_id", c."trace_id", c."created_at"
	FROM "traces_agent_chats" c
	ORDER BY c."project_id", c."trace_id", c."created_at" DESC
),
"fanned" AS (
	SELECT l."old_chat_id", l."project_id", l."trace_id", l."created_at", p."workspace_id", m."user_id",
		gen_random_uuid() AS new_id
	FROM "latest" l
	JOIN "projects" p ON p."id" = l."project_id"
	JOIN "members_of_workspaces" m ON m."workspace_id" = p."workspace_id"
),
"ins_sessions" AS (
	INSERT INTO "chat_sessions" ("id", "created_at", "project_id", "channel_type", "workspace_id", "last_used_at", "user_id", "trace_id")
	SELECT new_id, "created_at", "project_id", 'ui', "workspace_id", "created_at", "user_id", "trace_id" FROM "fanned"
)
INSERT INTO "chat_messages" ("id", "created_at", "role", "parts", "chat_id", "project_id")
SELECT gen_random_uuid(), msg."created_at", msg."role", msg."parts", f."new_id", msg."project_id"
FROM "fanned" f
JOIN "traces_agent_messages" msg ON msg."chat_id" = f."old_chat_id";--> statement-breakpoint
DROP TABLE "traces_agent_messages";--> statement-breakpoint
DROP TABLE "traces_agent_chats";
