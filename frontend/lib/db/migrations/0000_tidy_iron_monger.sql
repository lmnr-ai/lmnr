CREATE TYPE "public"."event_source" AS ENUM('AUTO', 'MANUAL', 'CODE');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('BOOLEAN', 'STRING', 'NUMBER');--> statement-breakpoint
CREATE TYPE "public"."label_job_status" AS ENUM('RUNNING', 'DONE');--> statement-breakpoint
CREATE TYPE "public"."label_source" AS ENUM('MANUAL', 'AUTO');--> statement-breakpoint
CREATE TYPE "public"."label_type" AS ENUM('BOOLEAN', 'CATEGORICAL');--> statement-breakpoint
CREATE TYPE "public"."span_type" AS ENUM('DEFAULT', 'LLM', 'PIPELINE', 'EXECUTOR', 'EVALUATOR', 'EVALUATION');--> statement-breakpoint
CREATE TYPE "public"."trace_type" AS ENUM('DEFAULT', 'EVENT', 'EVALUATION');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('member', 'owner');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"api_key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT 'default' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dataset_datapoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	"indexed_on" text,
	"target" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"index_in_batch" bigint,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"indexed_on" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evaluation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"target" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"executor_output" jsonb,
	"index_in_batch" bigint,
	"error" jsonb,
	"scores" jsonb NOT NULL,
	"trace_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"metadata" jsonb,
	"score_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"average_scores" jsonb,
	"group_id" text DEFAULT 'default' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid NOT NULL,
	"event_type" "event_type" DEFAULT 'BOOLEAN' NOT NULL,
	CONSTRAINT "unique_name_project_id" UNIQUE("name","project_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"span_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"template_id" uuid NOT NULL,
	"source" "event_source" NOT NULL,
	"metadata" jsonb,
	"value" jsonb NOT NULL,
	"data" text,
	"inputs" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "label_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid NOT NULL,
	"label_type" "label_type" NOT NULL,
	"value_map" jsonb DEFAULT '[false,true]'::jsonb NOT NULL,
	"description" text,
	"evaluator_runnable_graph" jsonb,
	"pipeline_version_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "label_classes_for_path" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"label_class_id" uuid NOT NULL,
	CONSTRAINT "unique_project_id_path_label_class" UNIQUE("project_id","path","label_class_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"class_id" uuid NOT NULL,
	"value" double precision DEFAULT '0',
	"span_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid DEFAULT gen_random_uuid(),
	"label_source" "label_source" DEFAULT 'MANUAL' NOT NULL,
	"job_status" "label_job_status",
	"reasoning" text,
	CONSTRAINT "labels_span_id_class_id_user_id_key" UNIQUE("class_id","span_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_price_per_million" double precision NOT NULL,
	"output_price_per_million" double precision NOT NULL,
	"input_cached_price_per_million" double precision,
	"additional_prices" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "members_of_workspaces" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_role" "workspace_role" DEFAULT 'owner' NOT NULL,
	CONSTRAINT "members_of_workspaces_user_workspace_unique" UNIQUE("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"runnable_graph" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"displayable_graph" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"number_of_nodes" bigint NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"display_group" text DEFAULT 'build' NOT NULL,
	"ordinal" integer DEFAULT 500 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"displayable_graph" jsonb NOT NULL,
	"runnable_graph" jsonb NOT NULL,
	"pipeline_type" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"visibility" text DEFAULT 'PRIVATE' NOT NULL,
	"python_requirements" text DEFAULT '' NOT NULL,
	CONSTRAINT "unique_project_id_pipeline_name" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_api_keys" (
	"value" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text,
	"project_id" uuid NOT NULL,
	"shorthand" text DEFAULT '' NOT NULL,
	"hash" text DEFAULT '' NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"workspace_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"nonce_hex" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spans" (
	"span_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parent_span_id" uuid,
	"name" text NOT NULL,
	"attributes" jsonb,
	"input" jsonb,
	"output" jsonb,
	"span_type" "span_type" NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"trace_id" uuid NOT NULL,
	"version" text NOT NULL,
	"input_preview" text,
	"output_preview" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_tiers" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "subscription_tiers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775000 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"storage_mib" bigint NOT NULL,
	"log_retention_days" bigint NOT NULL,
	"members_per_workspace" bigint DEFAULT '-1' NOT NULL,
	"num_workspaces" bigint DEFAULT '-1' NOT NULL,
	"stripe_product_id" text DEFAULT '' NOT NULL,
	"events" bigint DEFAULT '0' NOT NULL,
	"spans" bigint DEFAULT '0' NOT NULL,
	"extra_span_price" double precision DEFAULT '0' NOT NULL,
	"extra_event_price" double precision DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "target_pipeline_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"pipeline_version_id" uuid NOT NULL,
	CONSTRAINT "unique_pipeline_id" UNIQUE("pipeline_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"release" text,
	"user_id" text,
	"session_id" text,
	"metadata" jsonb,
	"project_id" uuid NOT NULL,
	"end_time" timestamp with time zone,
	"start_time" timestamp with time zone,
	"total_token_count" bigint DEFAULT '0' NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"cost" double precision DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trace_type" "trace_type" DEFAULT 'DEFAULT' NOT NULL,
	"input_token_count" bigint DEFAULT '0' NOT NULL,
	"output_token_count" bigint DEFAULT '0' NOT NULL,
	"input_cost" double precision DEFAULT '0' NOT NULL,
	"output_cost" double precision DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_subscription_info" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"activated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "users_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_usage" (
	"workspace_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"span_count" bigint DEFAULT '0' NOT NULL,
	"span_count_since_reset" bigint DEFAULT '0' NOT NULL,
	"prev_span_count" bigint DEFAULT '0' NOT NULL,
	"event_count" bigint DEFAULT '0' NOT NULL,
	"event_count_since_reset" bigint DEFAULT '0' NOT NULL,
	"prev_event_count" bigint DEFAULT '0' NOT NULL,
	"reset_time" timestamp with time zone DEFAULT now() NOT NULL,
	"reset_reason" text DEFAULT 'signup' NOT NULL,
	CONSTRAINT "user_usage_workspace_id_key" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"tier_id" bigint DEFAULT '1' NOT NULL,
	"subscription_id" text DEFAULT '' NOT NULL,
	"additional_seats" bigint DEFAULT '0' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dataset_datapoints" ADD CONSTRAINT "dataset_datapoints_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "datasets" ADD CONSTRAINT "public_datasets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_evaluation_id_fkey1" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_project_id_fkey1" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_templates" ADD CONSTRAINT "event_templates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."event_templates"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "label_classes" ADD CONSTRAINT "label_classes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "label_classes_for_path" ADD CONSTRAINT "autoeval_labels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "labels" ADD CONSTRAINT "trace_tags_span_id_fkey" FOREIGN KEY ("span_id") REFERENCES "public"."spans"("span_id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "labels" ADD CONSTRAINT "trace_tags_type_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."label_classes"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "members_of_workspaces" ADD CONSTRAINT "members_of_workspaces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "members_of_workspaces" ADD CONSTRAINT "public_members_of_workspaces_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_api_keys" ADD CONSTRAINT "public_project_api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_api_keys" ADD CONSTRAINT "provider_api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spans" ADD CONSTRAINT "new_spans_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "target_pipeline_versions" ADD CONSTRAINT "target_pipeline_versions_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "target_pipeline_versions" ADD CONSTRAINT "target_pipeline_versions_pipeline_version_id_fkey" FOREIGN KEY ("pipeline_version_id") REFERENCES "public"."pipeline_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "traces" ADD CONSTRAINT "new_traces_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_subscription_info" ADD CONSTRAINT "user_subscription_info_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_usage" ADD CONSTRAINT "user_usage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "public"."subscription_tiers"("id") ON DELETE no action ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_results_evaluation_id_idx" ON "evaluation_results" USING btree ("evaluation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_of_workspaces_user_id_idx" ON "members_of_workspaces" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipelines_name_project_id_idx" ON "pipelines" USING btree ("name","project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipelines_project_id_idx" ON "pipelines" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_workspace_id_idx" ON "projects" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "span_path_idx" ON "spans" USING btree ((attributes -> 'lmnr.span.path'::text));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_start_time_end_time_idx" ON "spans" USING btree ("start_time","end_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_trace_id_idx" ON "spans" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traces_project_id_idx" ON "traces" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traces_session_id_idx" ON "traces" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traces_start_time_end_time_idx" ON "traces" USING btree ("start_time","end_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_subscription_info_stripe_customer_id_idx" ON "user_subscription_info" USING btree ("stripe_customer_id");