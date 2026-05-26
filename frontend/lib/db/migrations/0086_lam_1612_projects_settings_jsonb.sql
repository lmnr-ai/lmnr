ALTER TABLE "projects" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
UPDATE "projects" SET "settings" = jsonb_build_object('removePii', "remove_pii") WHERE "remove_pii" = true;
ALTER TABLE "projects" DROP COLUMN "remove_pii";
