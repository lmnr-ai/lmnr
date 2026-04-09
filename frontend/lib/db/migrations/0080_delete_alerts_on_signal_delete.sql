DELETE FROM "alerts" WHERE "source_id" NOT IN (SELECT "id" FROM "signals");--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;
