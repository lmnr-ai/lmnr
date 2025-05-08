ALTER TABLE "playgrounds" ADD COLUMN "tools" jsonb DEFAULT '""'::jsonb;
ALTER TABLE "playgrounds" ADD COLUMN "tool_choice" jsonb DEFAULT '"none"'::jsonb;
ALTER TABLE "playgrounds" ADD COLUMN "max_tokens" integer DEFAULT 1024;
ALTER TABLE "playgrounds" ADD COLUMN "temperature" double precision DEFAULT 1;
ALTER TABLE "playgrounds" ADD COLUMN "provider_options" jsonb DEFAULT '{}'::jsonb;