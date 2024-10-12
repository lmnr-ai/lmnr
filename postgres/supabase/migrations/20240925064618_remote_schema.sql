

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


COMMENT ON SCHEMA "public" IS 'standard public schema';


CREATE TYPE "public"."evaluation_job_status" AS ENUM (
    'Started',
    'Finished',
    'Error'
);


ALTER TYPE "public"."evaluation_job_status" OWNER TO "postgres";


COMMENT ON TYPE "public"."evaluation_job_status" IS 'Status of an evaluation job';



CREATE TYPE "public"."evaluation_status" AS ENUM (
    'Success',
    'Error'
);


ALTER TYPE "public"."evaluation_status" OWNER TO "postgres";


COMMENT ON TYPE "public"."evaluation_status" IS 'Status of an evaluation datapoint run';



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
    "index_in_batch" bigint
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
    "status" "public"."evaluation_status" NOT NULL,
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
    "status" "public"."evaluation_job_status" DEFAULT 'Started'::"public"."evaluation_job_status" NOT NULL,
    "metadata" "jsonb",
    "score_names" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "average_scores" "jsonb"
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
    "value_map" "jsonb" DEFAULT '[false, true]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."label_classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."labels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "value" double precision DEFAULT '0'::double precision NOT NULL,
    "span_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_updated_by" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."labels" OWNER TO "postgres";


COMMENT ON TABLE "public"."labels" IS 'span-level label instance';



CREATE TABLE IF NOT EXISTS "public"."members_of_workspaces" (
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_role" "public"."workspace_role" DEFAULT 'owner'::"public"."workspace_role" NOT NULL
);


ALTER TABLE "public"."members_of_workspaces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "run_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "node_name" "text" NOT NULL,
    "node_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "node_type" "text" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "value" "jsonb" NOT NULL,
    "meta_log" "jsonb",
    "input_message_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."old_traces" (
    "run_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pipeline_version_id" "uuid" NOT NULL,
    "success" boolean DEFAULT true NOT NULL,
    "start_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "end_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_token_count" bigint DEFAULT '0'::bigint NOT NULL,
    "approximate_cost" double precision,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "run_type" "text" NOT NULL,
    "output_message_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."old_traces" OWNER TO "postgres";


COMMENT ON COLUMN "public"."old_traces"."output_message_ids" IS 'Array of Uuid values that point to output_messages';



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
    "value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "project_id" "uuid" NOT NULL
);


ALTER TABLE "public"."project_api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "workspace_id" "uuid" NOT NULL
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spans" (
    "span_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_span_id" "uuid",
    "name" "text" NOT NULL,
    "attributes" "jsonb" NOT NULL,
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
    "trace_type" "public"."trace_type" DEFAULT 'DEFAULT'::"public"."trace_type" NOT NULL
);


ALTER TABLE "public"."traces" OWNER TO "postgres";


COMMENT ON COLUMN "public"."traces"."version" IS 'Version of Laminar''s trace format';



COMMENT ON COLUMN "public"."traces"."release" IS 'User''s release version';



COMMENT ON COLUMN "public"."traces"."user_id" IS 'Laminar''s customers'' user id';



CREATE TABLE IF NOT EXISTS "public"."user_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "additional_seats" bigint DEFAULT '0'::bigint NOT NULL,
    "code_services" bigint DEFAULT '0'::bigint NOT NULL
);


ALTER TABLE "public"."user_limits" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_limits" IS 'Overrides limits for each particular owner of workspace';



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



CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "tier_id" bigint DEFAULT '0'::bigint NOT NULL,
    "subscription_id" "text" DEFAULT ''::"text" NOT NULL,
    "additional_seats" bigint DEFAULT '0'::bigint NOT NULL
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


COMMENT ON COLUMN "public"."workspaces"."subscription_id" IS 'stripe_subscription_id';



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("api_key");



ALTER TABLE ONLY "public"."datasets"
    ADD CONSTRAINT "datasets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evaluation_results"
    ADD CONSTRAINT "evaluation_results_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evaluations"
    ADD CONSTRAINT "evaluations_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_templates"
    ADD CONSTRAINT "event_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members_of_workspaces"
    ADD CONSTRAINT "members_of_organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members_of_workspaces"
    ADD CONSTRAINT "members_of_workspaces_user_workspace_unique" UNIQUE ("user_id", "workspace_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spans"
    ADD CONSTRAINT "new_spans_pkey" PRIMARY KEY ("span_id");



ALTER TABLE ONLY "public"."traces"
    ADD CONSTRAINT "new_traces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_templates"
    ADD CONSTRAINT "pipeline_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_versions"
    ADD CONSTRAINT "pipeline_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipelines"
    ADD CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_api_keys"
    ADD CONSTRAINT "project_api_keys_pkey" PRIMARY KEY ("value");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_tiers"
    ADD CONSTRAINT "subscription_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."label_classes"
    ADD CONSTRAINT "tag_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "tags_unique_per_span" UNIQUE ("class_id", "span_id");



ALTER TABLE ONLY "public"."target_pipeline_versions"
    ADD CONSTRAINT "target_pipeline_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dataset_datapoints"
    ADD CONSTRAINT "tmp_dataset_datapoints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "trace_feedbacks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."old_traces"
    ADD CONSTRAINT "traces_pkey" PRIMARY KEY ("run_id");



ALTER TABLE ONLY "public"."event_templates"
    ADD CONSTRAINT "unique_name_project_id" UNIQUE ("name", "project_id");



ALTER TABLE ONLY "public"."target_pipeline_versions"
    ADD CONSTRAINT "unique_pipeline_id" UNIQUE ("pipeline_id");



ALTER TABLE ONLY "public"."pipelines"
    ADD CONSTRAINT "unique_project_id_pipeline_name" UNIQUE ("project_id", "name");



ALTER TABLE ONLY "public"."user_subscription_info"
    ADD CONSTRAINT "user_checkout_email_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_limits"
    ADD CONSTRAINT "user_limits_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_id_key" UNIQUE ("id");



CREATE INDEX "evaluation_results_evaluation_id_idx1" ON "public"."evaluation_results" USING "btree" ("evaluation_id");



CREATE INDEX "members_of_workspaces_user_id_idx" ON "public"."members_of_workspaces" USING "btree" ("user_id");



CREATE INDEX "messages_run_id_idx" ON "public"."messages" USING "btree" ("run_id");



CREATE INDEX "new_traces_session_id_idx" ON "public"."traces" USING "btree" ("session_id");



CREATE INDEX "pipelines_name_project_id_idx" ON "public"."pipelines" USING "btree" ("name", "project_id");



CREATE INDEX "pipelines_project_id_idx" ON "public"."pipelines" USING "btree" ("project_id");



CREATE INDEX "projects_workspace_id_idx" ON "public"."projects" USING "btree" ("workspace_id");



CREATE INDEX "traces_pipeline_version_id_idx" ON "public"."old_traces" USING "btree" ("pipeline_version_id");



CREATE INDEX "traces_run_type_idx" ON "public"."old_traces" USING "hash" ("run_type");



CREATE INDEX "user_subscription_info_stripe_customer_id_idx" ON "public"."user_subscription_info" USING "btree" ("stripe_customer_id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evaluation_results"
    ADD CONSTRAINT "evaluation_results_evaluation_id_fkey1" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evaluations"
    ADD CONSTRAINT "evaluations_project_id_fkey1" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_templates"
    ADD CONSTRAINT "event_types_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."event_templates"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members_of_workspaces"
    ADD CONSTRAINT "members_of_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."old_traces"("run_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spans"
    ADD CONSTRAINT "new_spans_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."traces"
    ADD CONSTRAINT "new_traces_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipeline_versions"
    ADD CONSTRAINT "pipeline_versions_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipelines"
    ADD CONSTRAINT "pipelines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."datasets"
    ADD CONSTRAINT "public_datasets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members_of_workspaces"
    ADD CONSTRAINT "public_members_of_workspaces_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_api_keys"
    ADD CONSTRAINT "public_project_api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dataset_datapoints"
    ADD CONSTRAINT "public_tmp_dataset_datapoints_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."label_classes"
    ADD CONSTRAINT "tag_types_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."target_pipeline_versions"
    ADD CONSTRAINT "target_pipeline_versions_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."target_pipeline_versions"
    ADD CONSTRAINT "target_pipeline_versions_pipeline_version_id_fkey" FOREIGN KEY ("pipeline_version_id") REFERENCES "public"."pipeline_versions"("id");



ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "trace_tags_span_id_fkey" FOREIGN KEY ("span_id") REFERENCES "public"."spans"("span_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "trace_tags_type_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."label_classes"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."old_traces"
    ADD CONSTRAINT "traces_pipeline_version_id_fkey" FOREIGN KEY ("pipeline_version_id") REFERENCES "public"."pipeline_versions"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_subscription_info"
    ADD CONSTRAINT "user_checkout_email_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_limits"
    ADD CONSTRAINT "user_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;


ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "public"."subscription_tiers"("id") ON UPDATE CASCADE;



CREATE POLICY "Enable insert for authenticated users only" ON "public"."api_keys" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."users" FOR INSERT TO "service_role" WITH CHECK (true);



ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dataset_datapoints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."datasets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."evaluation_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."evaluations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."label_classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."labels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."members_of_workspaces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."old_traces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipeline_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipeline_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipelines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_tiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."target_pipeline_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."traces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_subscription_info" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
























































































































































































































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



GRANT ALL ON TABLE "public"."labels" TO "anon";
GRANT ALL ON TABLE "public"."labels" TO "authenticated";
GRANT ALL ON TABLE "public"."labels" TO "service_role";



GRANT ALL ON TABLE "public"."members_of_workspaces" TO "anon";
GRANT ALL ON TABLE "public"."members_of_workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."members_of_workspaces" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."old_traces" TO "anon";
GRANT ALL ON TABLE "public"."old_traces" TO "authenticated";
GRANT ALL ON TABLE "public"."old_traces" TO "service_role";



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



GRANT ALL ON TABLE "public"."user_limits" TO "anon";
GRANT ALL ON TABLE "public"."user_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."user_limits" TO "service_role";



GRANT ALL ON TABLE "public"."user_subscription_info" TO "anon";
GRANT ALL ON TABLE "public"."user_subscription_info" TO "authenticated";
GRANT ALL ON TABLE "public"."user_subscription_info" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



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

--
-- Dumped schema changes for auth and storage
--

