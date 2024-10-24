drop index if exists "public"."spans_expr_idx";

alter table "public"."spans" add column "input_preview" text;

alter table "public"."spans" add column "output_preview" text;

CREATE INDEX span_path_idx ON public.spans USING btree (((attributes -> 'lmnr.span.path'::text)));

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

alter table "public"."users" add constraint "users_email_key" UNIQUE using index "users_email_key";


