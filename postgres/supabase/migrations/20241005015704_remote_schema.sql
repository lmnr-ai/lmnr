create type "public"."label_source" as enum ('MANUAL', 'AUTO');

alter table "public"."labels" drop constraint "tags_unique_per_span";

drop index if exists "public"."tags_unique_per_span";

alter table "public"."dataset_datapoints" add column "metadata" jsonb;

alter table "public"."evaluation_results" alter column "status" drop not null;

alter table "public"."evaluations" add column "group_id" text not null default 'default'::text;

alter table "public"."evaluations" alter column "status" drop not null;

alter table "public"."label_classes" add column "description" text;

alter table "public"."label_classes" add column "pipeline_version_id" uuid;

alter table "public"."labels" drop column "last_updated_by";

alter table "public"."labels" add column "label_source" label_source not null default 'MANUAL'::label_source;

alter table "public"."labels" add column "user_id" uuid default gen_random_uuid();

alter table "public"."spans" alter column "attributes" drop not null;

CREATE UNIQUE INDEX labels_span_id_class_id_user_id_key ON public.labels USING btree (span_id, class_id, user_id);

CREATE INDEX spans_expr_idx ON public.spans USING btree (((attributes -> 'lmnr.span.path'::text)));

alter table "public"."labels" add constraint "labels_span_id_class_id_user_id_key" UNIQUE using index "labels_span_id_class_id_user_id_key";
