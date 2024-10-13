drop table "public"."user_limits";

alter table "public"."traces" add column "input_cost" double precision not null default '0'::double precision;

alter table "public"."traces" add column "input_token_count" bigint not null default '0'::bigint;

alter table "public"."traces" add column "output_cost" double precision not null default '0'::double precision;

alter table "public"."traces" add column "output_token_count" bigint not null default '0'::bigint;

alter table "public"."workspaces" alter column "tier_id" set default '1'::bigint;

