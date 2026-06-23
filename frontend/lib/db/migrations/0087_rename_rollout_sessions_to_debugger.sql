ALTER TABLE "rollout_sessions" RENAME TO "debugger_sessions";--> statement-breakpoint
ALTER TABLE "debugger_sessions" RENAME CONSTRAINT "rollout_sessions_project_id_fkey" TO "debugger_sessions_project_id_fkey";--> statement-breakpoint
ALTER INDEX "rollout_sessions_pkey" RENAME TO "debugger_sessions_pkey";--> statement-breakpoint
ALTER TABLE "debugger_sessions" DROP COLUMN "params";--> statement-breakpoint
ALTER TABLE "debugger_sessions" DROP COLUMN "status";
