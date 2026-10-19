-- Orphans from projects/signals deleted while these tables had no FKs; ADD CONSTRAINT would fail on them.
DELETE FROM "signals" s WHERE NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = s."project_id");--> statement-breakpoint
DELETE FROM "signal_triggers" t WHERE NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = t."project_id")
  OR NOT EXISTS (SELECT 1 FROM "signals" s WHERE s."id" = t."signal_id");--> statement-breakpoint
DELETE FROM "signal_jobs" j WHERE NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = j."project_id")
  OR NOT EXISTS (SELECT 1 FROM "signals" s WHERE s."id" = j."signal_id");--> statement-breakpoint
ALTER TABLE "signals" DROP CONSTRAINT IF EXISTS "signals_project_id_fkey";--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_triggers" DROP CONSTRAINT IF EXISTS "signal_triggers_project_id_fkey";--> statement-breakpoint
ALTER TABLE "signal_triggers" ADD CONSTRAINT "signal_triggers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_triggers" DROP CONSTRAINT IF EXISTS "signal_triggers_signal_id_fkey";--> statement-breakpoint
ALTER TABLE "signal_triggers" ADD CONSTRAINT "signal_triggers_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_jobs" DROP CONSTRAINT IF EXISTS "signal_jobs_project_id_fkey";--> statement-breakpoint
ALTER TABLE "signal_jobs" ADD CONSTRAINT "signal_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_jobs" DROP CONSTRAINT IF EXISTS "signal_jobs_signal_id_fkey";--> statement-breakpoint
ALTER TABLE "signal_jobs" ADD CONSTRAINT "signal_jobs_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE cascade ON UPDATE no action;
