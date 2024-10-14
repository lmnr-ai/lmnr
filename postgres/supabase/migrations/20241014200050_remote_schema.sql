alter table "public"."labels" drop constraint "labels_class_id_fkey";

alter table "public"."projects" drop constraint "projects_workspace_id_fkey";

alter table "public"."labels" drop constraint "labels_span_id_class_id_user_id_key";

alter table "public"."project_api_keys" drop constraint "project_api_keys_pkey";

drop index if exists "public"."project_api_keys_pkey";

alter table "public"."project_api_keys" add column "hash" text not null default ''::text;

alter table "public"."project_api_keys" add column "id" uuid not null default gen_random_uuid();

alter table "public"."project_api_keys" add column "shorthand" text not null default ''::text;

alter table "public"."project_api_keys" alter column "value" set default ''::text;

CREATE UNIQUE INDEX project_api_keys_pkey ON public.project_api_keys USING btree (id);

alter table "public"."project_api_keys" add constraint "project_api_keys_pkey" PRIMARY KEY using index "project_api_keys_pkey";

ALTER TABLE "public"."workspaces" ALTER COLUMN "tier_id" SET DEFAULT 0::bigint;
