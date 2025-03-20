ALTER TABLE "user_cookies" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_cookies" ADD COLUMN "nonce" text NOT NULL;