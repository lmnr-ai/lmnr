-- Migration 0062 recreated the retired browser agent's tables (and 0026 its enums); nothing reads them. Drop them so
-- "agent_sessions" is free.
DROP TABLE IF EXISTS "agent_messages" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_chats" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_sessions" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "agent_machine_status";--> statement-breakpoint
DROP TYPE IF EXISTS "agent_message_type";--> statement-breakpoint
CREATE TABLE "agent_document_revisions" (
	"session_id" uuid NOT NULL,
	"document_id" bigint NOT NULL,
	"seq" bigint NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"content" json NOT NULL,
	CONSTRAINT "agent_document_revisions_pkey" PRIMARY KEY("session_id","document_id","seq")
);
--> statement-breakpoint
CREATE TABLE "agent_records" (
	"session_id" uuid NOT NULL,
	"id" bigint NOT NULL,
	"type" text NOT NULL,
	"conversation_id" bigint,
	"owner_conversation_id" bigint,
	"owner_task_id" bigint,
	"head" bigint,
	"commit_seq" bigint,
	"kind" text,
	"status" text,
	"abort_requested" boolean,
	"background" boolean,
	"request_id" text,
	"has_key" boolean,
	"key_value" text,
	"scope_kind" text,
	"scope_id" bigint,
	"created_seq" bigint,
	"retired_seq" bigint,
	"record" json NOT NULL,
	CONSTRAINT "agent_records_pkey" PRIMARY KEY("session_id","id")
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"source" text DEFAULT 'ui' NOT NULL,
	"name" text,
	"next_id" bigint DEFAULT 2 NOT NULL,
	"next_seq" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_document_revisions" ADD CONSTRAINT "agent_document_revisions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_records" ADD CONSTRAINT "agent_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_records_entries_idx" ON "agent_records" USING btree ("session_id","conversation_id","id") WHERE type = 'entry';--> statement-breakpoint
CREATE INDEX "agent_records_tasks_idx" ON "agent_records" USING btree ("session_id","status","id") WHERE type = 'task';--> statement-breakpoint
CREATE INDEX "agent_records_live_tasks_idx" ON "agent_records" USING btree ("session_id") WHERE type = 'task' AND status <> 'terminal';--> statement-breakpoint
CREATE INDEX "agent_records_submissions_idx" ON "agent_records" USING btree ("session_id","conversation_id","request_id") WHERE type = 'submission';--> statement-breakpoint
CREATE INDEX "agent_records_documents_idx" ON "agent_records" USING btree ("session_id","scope_kind","scope_id","kind","id") WHERE type = 'document';--> statement-breakpoint
CREATE INDEX "agent_sessions_project_user_updated_idx" ON "agent_sessions" USING btree ("project_id","user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
-- Old chats become Pi Durable sessions with the same id, so CLI/MCP conversation ids keep working. Each session
-- gets what Pi 1.4.0 writes for a new root conversation (record 1, docs 2-6 at seq 1), then one entry per old
-- message from id 7 at seq 2. Assistant messages carry provider "legacy", so pi-ai drops their thinking and
-- signatures on replay and closes unanswered tool calls itself. Slack threads are not kept: the new session key
-- includes the project and the old one can't be inverted; a mention re-reads the thread from Slack anyway.
DELETE FROM "chat_sessions" s
WHERE s."channel_type" NOT IN ('ui', 'cli', 'mcp')
	OR NOT EXISTS (SELECT 1 FROM "chat_messages" m WHERE m."chat_id" = s."id");--> statement-breakpoint
INSERT INTO "agent_sessions" ("id", "project_id", "user_id", "source", "name", "next_id", "next_seq", "created_at", "updated_at")
SELECT s."id", s."project_id", s."user_id", s."channel_type", s."name", 7 + m."count", 3, s."created_at", s."last_used_at"
FROM "chat_sessions" s
JOIN (SELECT "chat_id", count(*) AS "count" FROM "chat_messages" GROUP BY "chat_id") m ON m."chat_id" = s."id";--> statement-breakpoint
INSERT INTO "agent_records" ("session_id", "id", "type", "record")
SELECT "id", 1, 'conversation', '{"id":1}'::json FROM "chat_sessions";--> statement-breakpoint
WITH "docs" ("id", "kind", "history", "fork", "content") AS (VALUES
	(2, 'pi.live', 'latest', 'initial', '{}'::jsonb),
	(3, 'pi.inbox', 'latest', 'initial', '{"items":[]}'::jsonb),
	(4, 'pi.usage', 'latest', 'initial', '{"models":{},"tools":{}}'::jsonb),
	(5, 'pi.provider', 'latest', 'initial', NULL),
	(6, 'pi.agent', 'rewindable', 'asOf', '{}'::jsonb)
),
"rows" AS (
	SELECT s."id" AS "session_id", d.*,
		coalesce(d."content", jsonb_build_object('sessionId', gen_random_uuid())) AS "value"
	FROM "chat_sessions" s CROSS JOIN "docs" d
),
"records" AS (
	INSERT INTO "agent_records" ("session_id", "id", "type", "kind", "has_key", "key_value", "scope_kind", "scope_id", "created_seq", "record")
	SELECT "session_id", "id", 'document', to_json("kind")::text, false, '""', 'conversation', 1, 1,
		json_build_object('id', "id", 'kind', "kind", 'scope', json_build_object('kind', 'conversation', 'conversationId', 1),
			'history', "history", 'fork', "fork", 'createdAt', 1)
	FROM "rows"
)
INSERT INTO "agent_document_revisions" ("session_id", "document_id", "seq", "kind", "version", "content")
SELECT "session_id", "id", 1, 'base', 1, "value"::json FROM "rows";--> statement-breakpoint
WITH "messages" AS (
	SELECT m."chat_id" AS "session_id", m."id" AS "message_id", m."role", m."parts",
		6 + row_number() OVER (PARTITION BY m."chat_id" ORDER BY m."created_at", m."id") AS "entry_id",
		(extract(epoch FROM m."created_at") * 1000)::bigint AS "ts",
		(SELECT coalesce(string_agg(p->>'text', '' ORDER BY i), '') FROM jsonb_array_elements(m."parts") WITH ORDINALITY e(p, i)
			WHERE p->>'type' = 'text') AS "text"
	FROM "chat_messages" m JOIN "chat_sessions" s ON s."id" = m."chat_id"
),
"entries" AS (
	SELECT "session_id", "entry_id", CASE "role"
		WHEN 'user' THEN jsonb_build_object(
			'kind', 'laminar.user',
			'data', jsonb_build_object('requestId', 'legacy:' || "message_id", 'text', "text"),
			'model', jsonb_build_array(jsonb_build_object('role', 'user', 'content', "text", 'timestamp', "ts")))
		WHEN 'assistant' THEN jsonb_build_object(
			'kind', 'pi.assistant',
			'model', jsonb_build_array(jsonb_build_object(
				'role', 'assistant',
				'content', (SELECT coalesce(jsonb_agg(CASE p->>'type'
						WHEN 'text' THEN jsonb_build_object('type', 'text', 'text', p->'text')
						WHEN 'thought' THEN jsonb_build_object('type', 'thinking', 'thinking', p->'text')
						ELSE jsonb_build_object('type', 'toolCall', 'id', p->'id', 'name', p->'name', 'arguments', p->'args')
					END ORDER BY i), '[]')
					FROM jsonb_array_elements("parts") WITH ORDINALITY e(p, i) WHERE p->>'type' IN ('text', 'thought', 'toolCall')),
				'api', 'legacy', 'provider', 'legacy', 'model', 'legacy',
				'usage', '{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}}'::jsonb,
				'stopReason', CASE WHEN "parts" @> '[{"type":"toolCall"}]' THEN 'toolUse' ELSE 'stop' END,
				'timestamp', "ts")))
		ELSE jsonb_build_object(
			'kind', 'pi.tool-result',
			'model', (SELECT coalesce(jsonb_agg(jsonb_build_object(
					'role', 'toolResult', 'toolCallId', p->'callId', 'toolName', p->'name',
					'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text',
						CASE jsonb_typeof(p->'result') WHEN 'string' THEN p->>'result' ELSE (p->'result')::text END)),
					'isError', false, 'timestamp', "ts") ORDER BY i), '[]')
				FROM jsonb_array_elements("parts") WITH ORDINALITY e(p, i) WHERE p->>'type' = 'toolResult'))
	END AS "entry"
	FROM "messages"
)
INSERT INTO "agent_records" ("session_id", "id", "type", "conversation_id", "commit_seq", "record")
SELECT "session_id", "entry_id", 'entry', 1, 2,
	("entry" || jsonb_build_object('id', "entry_id", 'conversationId', 1))::json
FROM "entries";--> statement-breakpoint
DROP TABLE "chat_messages";--> statement-breakpoint
DROP TABLE "chat_sessions";
