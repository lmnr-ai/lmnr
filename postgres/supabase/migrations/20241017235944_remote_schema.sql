

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


-- CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






-- CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



-- CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






-- CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






-- CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






-- CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






--CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."event_source" AS ENUM (
    'AUTO',
    'MANUAL',
    'CODE'
);


ALTER TYPE "public"."event_source" OWNER TO "postgres";


CREATE TYPE "public"."event_type" AS ENUM (
    'BOOLEAN',
    'STRING',
    'NUMBER'
);


ALTER TYPE "public"."event_type" OWNER TO "postgres";


CREATE TYPE "public"."label_job_status" AS ENUM (
    'RUNNING',
    'DONE'
);


ALTER TYPE "public"."label_job_status" OWNER TO "postgres";


CREATE TYPE "public"."label_source" AS ENUM (
    'MANUAL',
    'AUTO'
);


ALTER TYPE "public"."label_source" OWNER TO "postgres";


CREATE TYPE "public"."label_type" AS ENUM (
    'BOOLEAN',
    'CATEGORICAL'
);


ALTER TYPE "public"."label_type" OWNER TO "postgres";


CREATE TYPE "public"."span_type" AS ENUM (
    'DEFAULT',
    'LLM',
    'PIPELINE',
    'EXECUTOR',
    'EVALUATOR',
    'EVALUATION'
);


ALTER TYPE "public"."span_type" OWNER TO "postgres";


CREATE TYPE "public"."trace_type" AS ENUM (
    'DEFAULT',
    'EVENT',
    'EVALUATION'
);


ALTER TYPE "public"."trace_type" OWNER TO "postgres";


CREATE TYPE "public"."workspace_role" AS ENUM (
    'member',
    'owner'
);


ALTER TYPE "public"."workspace_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."api_key"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select
  	coalesce(
		nullif(current_setting('request.jwt.claim.sub', true), ''),
		(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
	)::text
$$;


ALTER FUNCTION "public"."api_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_evaluation_id_accessible_for_api_key"("_api_key" "text", "_evaluation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$WITH workspace_ids_for_user(workspace_id) AS (
    SELECT workspace_id from members_of_workspaces where user_id = (
        SELECT user_id from api_keys WHERE api_key = _api_key
    ) 
),
evaluation_ids(id) AS (
    SELECT id from evaluations where project_id in (   
        SELECT id from projects WHERE workspace_id in (
            SELECT workspace_id from workspace_ids_for_user
        )
    )
)
select _evaluation_id in (select id from evaluation_ids)$$;


ALTER FUNCTION "public"."is_evaluation_id_accessible_for_api_key"("_api_key" "text", "_evaluation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_pipeline_id_accessible_for_api_key"("_api_key" "text", "_pipeline_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$WITH workspace_ids_for_user(workspace_id) AS (
    SELECT workspace_id from members_of_workspaces where user_id = (
        SELECT user_id from api_keys WHERE api_key = _api_key
    ) 
),
pipeline_ids(id) AS (
    SELECT id from pipelines where project_id in (   
        SELECT id from projects WHERE workspace_id in (
            SELECT workspace_id from workspace_ids_for_user
        )
    )
)
select _pipeline_id in (select id from pipeline_ids)$$;


ALTER FUNCTION "public"."is_pipeline_id_accessible_for_api_key"("_api_key" "text", "_pipeline_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_trace_id_accessible_for_api_key"("_api_key" "text", "_trace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$WITH workspace_ids_for_user(workspace_id) AS (
    SELECT workspace_id from members_of_workspaces where user_id = (
        SELECT user_id from api_keys WHERE api_key = _api_key
    ) 
),
trace_ids(id) AS (
    SELECT id from traces where project_id in (   
        SELECT id from projects WHERE workspace_id in (
            SELECT workspace_id from workspace_ids_for_user
        )
    )
)
select _trace_id in (select id from trace_ids)$$;


ALTER FUNCTION "public"."is_trace_id_accessible_for_api_key"("_api_key" "text", "_trace_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "api_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'default'::"text" NOT NULL
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dataset_datapoints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dataset_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data" "jsonb" NOT NULL,
    "indexed_on" "text",
    "target" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "index_in_batch" bigint,
    "metadata" "jsonb"
);


ALTER TABLE "public"."dataset_datapoints" OWNER TO "postgres";


COMMENT ON COLUMN "public"."dataset_datapoints"."indexed_on" IS 'Name of column on which this datapoint is indexed, if any';



COMMENT ON COLUMN "public"."dataset_datapoints"."index_in_batch" IS 'When batch datapoints are added, we need to keep the index. This is opaque to the user';



CREATE TABLE IF NOT EXISTS "public"."datasets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "project_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "indexed_on" "text"
);


ALTER TABLE "public"."datasets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evaluation_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "evaluation_id" "uuid" NOT NULL,
    "data" "jsonb" NOT NULL,
    "target" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "executor_output" "jsonb",
    "index_in_batch" bigint,
    "error" "jsonb",
    "scores" "jsonb" NOT NULL,
    "trace_id" "uuid" NOT NULL
);


ALTER TABLE "public"."evaluation_results" OWNER TO "postgres";


COMMENT ON COLUMN "public"."evaluation_results"."index_in_batch" IS 'When batch datapoints are added, we need to keep the index. This is opaque to the user';



CREATE TABLE IF NOT EXISTS "public"."evaluations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "metadata" "jsonb",
    "score_names" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "average_scores" "jsonb",
    "group_id" "text" DEFAULT 'default'::"text" NOT NULL
);


ALTER TABLE "public"."evaluations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."evaluations"."metadata" IS 'Any additional metadata to associate with eval job';



COMMENT ON COLUMN "public"."evaluations"."score_names" IS 'Name of scores recorded across datapoints';



CREATE TABLE IF NOT EXISTS "public"."event_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "event_type" "public"."event_type" DEFAULT 'BOOLEAN'::"public"."event_type" NOT NULL
);


ALTER TABLE "public"."event_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."event_templates" IS 'Event types';



CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "span_id" "uuid" NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    "template_id" "uuid" NOT NULL,
    "source" "public"."event_source" NOT NULL,
    "metadata" "jsonb",
    "value" "jsonb" NOT NULL,
    "data" "text",
    "inputs" "jsonb"
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."events"."data" IS 'Data that was sent to automatic event evaluation';



CREATE TABLE IF NOT EXISTS "public"."label_classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "label_type" "public"."label_type" NOT NULL,
    "value_map" "jsonb" DEFAULT '[false, true]'::"jsonb" NOT NULL,
    "description" "text",
    "evaluator_runnable_graph" "jsonb",
    "pipeline_version_id" "uuid"
);


ALTER TABLE "public"."label_classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."label_classes_for_path" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "path" "text" NOT NULL,
    "label_class_id" "uuid" NOT NULL
);


ALTER TABLE "public"."label_classes_for_path" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."labels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "value" double precision DEFAULT '0'::double precision,
    "span_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" DEFAULT "gen_random_uuid"(),
    "label_source" "public"."label_source" DEFAULT 'MANUAL'::"public"."label_source" NOT NULL,
    "job_status" "public"."label_job_status",
    "reasoning" "text"
);


ALTER TABLE "public"."labels" OWNER TO "postgres";


COMMENT ON TABLE "public"."labels" IS 'span-level label instance';



COMMENT ON COLUMN "public"."labels"."reasoning" IS 'Explanation for the label value';



CREATE TABLE IF NOT EXISTS "public"."llm_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "input_price_per_million" double precision NOT NULL,
    "output_price_per_million" double precision NOT NULL,
    "input_cached_price_per_million" double precision,
    "additional_prices" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."llm_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."members_of_workspaces" (
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_role" "public"."workspace_role" DEFAULT 'owner'::"public"."workspace_role" NOT NULL
);


ALTER TABLE "public"."members_of_workspaces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "runnable_graph" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "displayable_graph" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "number_of_nodes" bigint NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "display_group" "text" DEFAULT 'build'::"text" NOT NULL,
    "ordinal" integer DEFAULT 500 NOT NULL
);


ALTER TABLE "public"."pipeline_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "displayable_graph" "jsonb" NOT NULL,
    "runnable_graph" "jsonb" NOT NULL,
    "pipeline_type" "text" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."pipeline_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipelines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "visibility" "text" DEFAULT 'PRIVATE'::"text" NOT NULL,
    "python_requirements" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."pipelines" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pipelines"."visibility" IS 'Whether the pipeline is public or private';



CREATE TABLE IF NOT EXISTS "public"."project_api_keys" (
    "value" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "project_id" "uuid" NOT NULL,
    "shorthand" "text" DEFAULT ''::"text" NOT NULL,
    "hash" "text" DEFAULT ''::"text" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."project_api_keys" OWNER TO "postgres";


COMMENT ON COLUMN "public"."project_api_keys"."shorthand" IS 'truncated value for display';



CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "workspace_id" "uuid" NOT NULL
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "project_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nonce_hex" "text" NOT NULL,
    "value" "text" NOT NULL,
    "shorthand" "text" NOT NULL
);


ALTER TABLE "public"."provider_api_keys" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_api_keys" IS 'Keys for model providers stored from browser and used in online evals';



CREATE TABLE IF NOT EXISTS "public"."spans" (
    "span_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_span_id" "uuid",
    "name" "text" NOT NULL,
    "attributes" "jsonb",
    "input" "jsonb",
    "output" "jsonb",
    "span_type" "public"."span_type" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "trace_id" "uuid" NOT NULL,
    "version" "text" NOT NULL
);


ALTER TABLE "public"."spans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_tiers" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "storage_mib" bigint NOT NULL,
    "log_retention_days" bigint NOT NULL,
    "members_per_workspace" bigint DEFAULT '-1'::bigint NOT NULL,
    "num_workspaces" bigint DEFAULT '-1'::bigint NOT NULL,
    "stripe_product_id" "text" DEFAULT ''::"text" NOT NULL,
    "events" bigint DEFAULT '0'::bigint NOT NULL,
    "spans" bigint DEFAULT '0'::bigint NOT NULL,
    "extra_span_price" double precision DEFAULT '0'::double precision NOT NULL,
    "extra_event_price" double precision DEFAULT '0'::double precision NOT NULL
);


ALTER TABLE "public"."subscription_tiers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."subscription_tiers"."storage_mib" IS 'Storage space allocated in MibiBytes (1024 x 1024 bytes)';



ALTER TABLE "public"."subscription_tiers" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."subscription_tiers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."target_pipeline_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "pipeline_version_id" "uuid" NOT NULL
);


ALTER TABLE "public"."target_pipeline_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."traces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" "text" NOT NULL,
    "release" "text",
    "user_id" "text",
    "session_id" "text",
    "metadata" "jsonb",
    "project_id" "uuid" NOT NULL,
    "end_time" timestamp with time zone,
    "start_time" timestamp with time zone,
    "total_token_count" bigint DEFAULT '0'::bigint NOT NULL,
    "success" boolean DEFAULT true NOT NULL,
    "cost" double precision DEFAULT '0'::double precision NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trace_type" "public"."trace_type" DEFAULT 'DEFAULT'::"public"."trace_type" NOT NULL,
    "input_token_count" bigint DEFAULT '0'::bigint NOT NULL,
    "output_token_count" bigint DEFAULT '0'::bigint NOT NULL,
    "input_cost" double precision DEFAULT '0'::double precision NOT NULL,
    "output_cost" double precision DEFAULT '0'::double precision NOT NULL
);


ALTER TABLE "public"."traces" OWNER TO "postgres";


COMMENT ON COLUMN "public"."traces"."version" IS 'Version of Laminar''s trace format';



COMMENT ON COLUMN "public"."traces"."release" IS 'User''s release version';



COMMENT ON COLUMN "public"."traces"."user_id" IS 'Laminar''s customers'' user id';



CREATE TABLE IF NOT EXISTS "public"."user_subscription_info" (
    "user_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "activated" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."user_subscription_info" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_usage" (
    "workspace_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "span_count" bigint DEFAULT '0'::bigint NOT NULL,
    "span_count_since_reset" bigint DEFAULT '0'::bigint NOT NULL,
    "prev_span_count" bigint DEFAULT '0'::bigint NOT NULL,
    "event_count" bigint DEFAULT '0'::bigint NOT NULL,
    "event_count_since_reset" bigint DEFAULT '0'::bigint NOT NULL,
    "prev_event_count" bigint DEFAULT '0'::bigint NOT NULL,
    "reset_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reset_reason" "text" DEFAULT 'signup'::"text" NOT NULL
);


ALTER TABLE "public"."workspace_usage" OWNER TO "postgres";


COMMENT ON COLUMN "public"."workspace_usage"."prev_span_count" IS 'Span count for the past billing period (month). Overriden at reset by the value of span_count_since_reset';



COMMENT ON COLUMN "public"."workspace_usage"."prev_event_count" IS 'Event count in the last billing period (month). Overriden at reset time by event_count_since_reset';



CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "tier_id" bigint DEFAULT '1'::bigint NOT NULL,
    "subscription_id" "text" DEFAULT ''::"text" NOT NULL,
    "additional_seats" bigint DEFAULT '0'::bigint NOT NULL
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


COMMENT ON COLUMN "public"."workspaces"."subscription_id" IS 'stripe_subscription_id';



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("api_key");



ALTER TABLE ONLY "public"."dataset_datapoints"
    ADD CONSTRAINT "dataset_datapoints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."datasets"
    ADD CONSTRAINT "datasets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evaluation_results"
    ADD CONSTRAINT "evaluation_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evaluations"
    ADD CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_templates"
    ADD CONSTRAINT "event_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."label_classes_for_path"
    ADD CONSTRAINT "label_classes_for_path_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."label_classes"
    ADD CONSTRAINT "label_classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "labels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "labels_span_id_class_id_user_id_key" UNIQUE NULLS NOT DISTINCT ("span_id", "class_id", "user_id");



ALTER TABLE ONLY "public"."llm_prices"
    ADD CONSTRAINT "llm_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members_of_workspaces"
    ADD CONSTRAINT "members_of_workspaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members_of_workspaces"
    ADD CONSTRAINT "members_of_workspaces_user_workspace_unique" UNIQUE ("user_id", "workspace_id");



ALTER TABLE ONLY "public"."pipeline_templates"
    ADD CONSTRAINT "pipeline_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_versions"
    ADD CONSTRAINT "pipeline_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipelines"
    ADD CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_api_keys"
    ADD CONSTRAINT "project_api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_api_keys"
    ADD CONSTRAINT "provider_api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spans"
    ADD CONSTRAINT "spans_pkey" PRIMARY KEY ("span_id");



ALTER TABLE ONLY "public"."subscription_tiers"
    ADD CONSTRAINT "subscription_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."target_pipeline_versions"
    ADD CONSTRAINT "target_pipeline_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."traces"
    ADD CONSTRAINT "traces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_templates"
    ADD CONSTRAINT "unique_name_project_id" UNIQUE ("name", "project_id");



ALTER TABLE ONLY "public"."target_pipeline_versions"
    ADD CONSTRAINT "unique_pipeline_id" UNIQUE ("pipeline_id");



ALTER TABLE ONLY "public"."label_classes_for_path"
    ADD CONSTRAINT "unique_project_id_path_label_class" UNIQUE ("project_id", "path", "label_class_id");



ALTER TABLE ONLY "public"."pipelines"
    ADD CONSTRAINT "unique_project_id_pipeline_name" UNIQUE ("project_id", "name");



ALTER TABLE ONLY "public"."user_subscription_info"
    ADD CONSTRAINT "user_checkout_email_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."workspace_usage"
    ADD CONSTRAINT "user_usage_pkey" PRIMARY KEY ("workspace_id");



ALTER TABLE ONLY "public"."workspace_usage"
    ADD CONSTRAINT "user_usage_workspace_id_key" UNIQUE ("workspace_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



CREATE INDEX "evaluation_results_evaluation_id_idx" ON "public"."evaluation_results" USING "btree" ("evaluation_id");



CREATE INDEX "members_of_workspaces_user_id_idx" ON "public"."members_of_workspaces" USING "btree" ("user_id");



CREATE INDEX "pipelines_name_project_id_idx" ON "public"."pipelines" USING "btree" ("name", "project_id");



CREATE INDEX "pipelines_project_id_idx" ON "public"."pipelines" USING "btree" ("project_id");



CREATE INDEX "projects_workspace_id_idx" ON "public"."projects" USING "btree" ("workspace_id");



CREATE INDEX "spans_expr_idx" ON "public"."spans" USING "btree" ((("attributes" -> 'lmnr.span.path'::"text")));



CREATE INDEX "spans_start_time_end_time_idx" ON "public"."spans" USING "btree" ("start_time", "end_time");



CREATE INDEX "spans_textsearch_input_plus_output_english" ON "public"."spans" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((("input")::"text" || ' '::"text") || ("output")::"text"))) WHERE ("start_time" > '2024-10-05 00:00:00+00'::timestamp with time zone);



CREATE INDEX "spans_trace_id_idx" ON "public"."spans" USING "btree" ("trace_id");



CREATE INDEX "traces_project_id_idx" ON "public"."traces" USING "btree" ("project_id");



CREATE INDEX "traces_session_id_idx" ON "public"."traces" USING "btree" ("session_id");



CREATE INDEX "traces_start_time_end_time_idx" ON "public"."traces" USING "btree" ("start_time", "end_time");



CREATE INDEX "user_subscription_info_stripe_customer_id_idx" ON "public"."user_subscription_info" USING "btree" ("stripe_customer_id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."label_classes_for_path"
    ADD CONSTRAINT "autoeval_labels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dataset_datapoints"
    ADD CONSTRAINT "dataset_datapoints_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evaluation_results"
    ADD CONSTRAINT "evaluation_results_evaluation_id_fkey1" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evaluations"
    ADD CONSTRAINT "evaluations_project_id_fkey1" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_templates"
    ADD CONSTRAINT "event_templates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."event_templates"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."label_classes"
    ADD CONSTRAINT "label_classes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members_of_workspaces"
    ADD CONSTRAINT "members_of_workspaces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spans"
    ADD CONSTRAINT "new_spans_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."traces"
    ADD CONSTRAINT "new_traces_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipelines"
    ADD CONSTRAINT "pipelines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_api_keys"
    ADD CONSTRAINT "provider_api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."datasets"
    ADD CONSTRAINT "public_datasets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members_of_workspaces"
    ADD CONSTRAINT "public_members_of_workspaces_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_api_keys"
    ADD CONSTRAINT "public_project_api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."target_pipeline_versions"
    ADD CONSTRAINT "target_pipeline_versions_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."target_pipeline_versions"
    ADD CONSTRAINT "target_pipeline_versions_pipeline_version_id_fkey" FOREIGN KEY ("pipeline_version_id") REFERENCES "public"."pipeline_versions"("id");



ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "trace_tags_span_id_fkey" FOREIGN KEY ("span_id") REFERENCES "public"."spans"("span_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "trace_tags_type_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."label_classes"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_subscription_info"
    ADD CONSTRAINT "user_subscription_info_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_usage"
    ADD CONSTRAINT "user_usage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "public"."subscription_tiers"("id") ON UPDATE CASCADE;



CREATE POLICY "Enable insert for authenticated users only" ON "public"."api_keys" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."users" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "all_actions_by_next_api_key" ON "public"."pipeline_versions" TO "authenticated", "anon" USING ("public"."is_pipeline_id_accessible_for_api_key"("public"."api_key"(), "pipeline_id"));



ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dataset_datapoints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."datasets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."evaluation_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."evaluations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."label_classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."label_classes_for_path" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."labels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."llm_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."members_of_workspaces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipeline_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipeline_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipelines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_api_keys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_by_next_api_key" ON "public"."evaluation_results" FOR SELECT TO "authenticated", "anon" USING ("public"."is_evaluation_id_accessible_for_api_key"("public"."api_key"(), "evaluation_id"));



CREATE POLICY "select_by_next_api_key" ON "public"."evaluations" FOR SELECT TO "authenticated", "anon" USING ("public"."is_evaluation_id_accessible_for_api_key"("public"."api_key"(), "id"));



CREATE POLICY "select_by_next_api_key" ON "public"."traces" FOR SELECT TO "authenticated", "anon" USING ("public"."is_trace_id_accessible_for_api_key"("public"."api_key"(), "id"));



ALTER TABLE "public"."spans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_tiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."target_pipeline_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."traces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_subscription_info" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;



ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."evaluations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."pipeline_versions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."traces";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





















































































































































































































GRANT ALL ON FUNCTION "public"."api_key"() TO "anon";
GRANT ALL ON FUNCTION "public"."api_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."api_key"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_evaluation_id_accessible_for_api_key"("_api_key" "text", "_evaluation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_evaluation_id_accessible_for_api_key"("_api_key" "text", "_evaluation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_evaluation_id_accessible_for_api_key"("_api_key" "text", "_evaluation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_pipeline_id_accessible_for_api_key"("_api_key" "text", "_pipeline_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_pipeline_id_accessible_for_api_key"("_api_key" "text", "_pipeline_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_pipeline_id_accessible_for_api_key"("_api_key" "text", "_pipeline_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_trace_id_accessible_for_api_key"("_api_key" "text", "_trace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_trace_id_accessible_for_api_key"("_api_key" "text", "_trace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trace_id_accessible_for_api_key"("_api_key" "text", "_trace_id" "uuid") TO "service_role";



























GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."dataset_datapoints" TO "anon";
GRANT ALL ON TABLE "public"."dataset_datapoints" TO "authenticated";
GRANT ALL ON TABLE "public"."dataset_datapoints" TO "service_role";



GRANT ALL ON TABLE "public"."datasets" TO "anon";
GRANT ALL ON TABLE "public"."datasets" TO "authenticated";
GRANT ALL ON TABLE "public"."datasets" TO "service_role";



GRANT ALL ON TABLE "public"."evaluation_results" TO "anon";
GRANT ALL ON TABLE "public"."evaluation_results" TO "authenticated";
GRANT ALL ON TABLE "public"."evaluation_results" TO "service_role";



GRANT ALL ON TABLE "public"."evaluations" TO "anon";
GRANT ALL ON TABLE "public"."evaluations" TO "authenticated";
GRANT ALL ON TABLE "public"."evaluations" TO "service_role";



GRANT ALL ON TABLE "public"."event_templates" TO "anon";
GRANT ALL ON TABLE "public"."event_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."event_templates" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."label_classes" TO "anon";
GRANT ALL ON TABLE "public"."label_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."label_classes" TO "service_role";



GRANT ALL ON TABLE "public"."label_classes_for_path" TO "anon";
GRANT ALL ON TABLE "public"."label_classes_for_path" TO "authenticated";
GRANT ALL ON TABLE "public"."label_classes_for_path" TO "service_role";



GRANT ALL ON TABLE "public"."labels" TO "anon";
GRANT ALL ON TABLE "public"."labels" TO "authenticated";
GRANT ALL ON TABLE "public"."labels" TO "service_role";



GRANT ALL ON TABLE "public"."llm_prices" TO "anon";
GRANT ALL ON TABLE "public"."llm_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_prices" TO "service_role";



GRANT ALL ON TABLE "public"."members_of_workspaces" TO "anon";
GRANT ALL ON TABLE "public"."members_of_workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."members_of_workspaces" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_templates" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_templates" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_versions" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_versions" TO "service_role";



GRANT ALL ON TABLE "public"."pipelines" TO "anon";
GRANT ALL ON TABLE "public"."pipelines" TO "authenticated";
GRANT ALL ON TABLE "public"."pipelines" TO "service_role";



GRANT ALL ON TABLE "public"."project_api_keys" TO "anon";
GRANT ALL ON TABLE "public"."project_api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."project_api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."provider_api_keys" TO "anon";
GRANT ALL ON TABLE "public"."provider_api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."spans" TO "anon";
GRANT ALL ON TABLE "public"."spans" TO "authenticated";
GRANT ALL ON TABLE "public"."spans" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_tiers" TO "anon";
GRANT ALL ON TABLE "public"."subscription_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_tiers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."subscription_tiers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."subscription_tiers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."subscription_tiers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."target_pipeline_versions" TO "anon";
GRANT ALL ON TABLE "public"."target_pipeline_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."target_pipeline_versions" TO "service_role";



GRANT ALL ON TABLE "public"."traces" TO "anon";
GRANT ALL ON TABLE "public"."traces" TO "authenticated";
GRANT ALL ON TABLE "public"."traces" TO "service_role";



GRANT ALL ON TABLE "public"."user_subscription_info" TO "anon";
GRANT ALL ON TABLE "public"."user_subscription_info" TO "authenticated";
GRANT ALL ON TABLE "public"."user_subscription_info" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_usage" TO "anon";
GRANT ALL ON TABLE "public"."workspace_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_usage" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
