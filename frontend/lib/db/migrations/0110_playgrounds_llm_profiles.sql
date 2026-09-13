ALTER TABLE "playgrounds" ADD COLUMN "llm_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "playgrounds" ADD COLUMN "llm_model" text;--> statement-breakpoint
ALTER TABLE "playgrounds" ADD CONSTRAINT "playgrounds_llm_profile_model_fkey" FOREIGN KEY ("llm_profile_id","llm_model") REFERENCES "llm_profile_models"("profile_id","name") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playgrounds" ADD CONSTRAINT "playgrounds_llm_profile_pair_check" CHECK ((llm_profile_id IS NULL) = (llm_model IS NULL));