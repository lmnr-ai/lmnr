DROP INDEX "agent_versions_agent_id_tool_definitions_hash_idx";--> statement-breakpoint
ALTER TABLE "agent_versions" ALTER COLUMN "tool_definitions" SET DEFAULT '';