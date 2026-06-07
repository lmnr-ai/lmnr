-- Collapse any pre-existing duplicate personal API keys to one per user before
-- enforcing uniqueness, keeping the earliest-created row. The table is write-only
-- (never read as a credential — app-server auth uses project_api_keys), so any
-- surviving key is equivalent.
DELETE FROM "api_keys"
WHERE "api_key" IN (
	SELECT "api_key" FROM (
		SELECT "api_key", row_number() OVER (PARTITION BY "user_id" ORDER BY "created_at", "api_key") AS rn
		FROM "api_keys"
	) ranked
	WHERE rn > 1
);--> statement-breakpoint
DROP INDEX "api_keys_user_id_idx";--> statement-breakpoint
-- Unique so the auth hooks can atomically upsert one personal key per user
-- (ON CONFLICT (user_id) DO NOTHING) without a racy check-then-insert.
CREATE UNIQUE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id" uuid_ops);
