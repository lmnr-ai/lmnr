CREATE TABLE "agent_chats" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_name" text DEFAULT 'New chat' NOT NULL,
	"user_id" uuid NOT NULL,
	"machine_status" "agent_machine_status" DEFAULT 'not_started',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"agent_status" text DEFAULT 'idle' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_chats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb,
	"message_type" "agent_message_type" NOT NULL,
	"trace_id" uuid
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cdp_url" text,
	"vnc_url" text,
	"machine_id" text,
	"state" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"agent_status" text DEFAULT 'idle' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clusters" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid DEFAULT gen_random_uuid(),
	"level" bigint NOT NULL,
	"num_children_clusters" bigint NOT NULL,
	"num_traces" bigint NOT NULL,
	"centroid" double precision[] NOT NULL,
	CONSTRAINT "clusters_pkey" PRIMARY KEY("id","project_id")
);
--> statement-breakpoint
-- CREATE TABLE "dataset_export_jobs" (
-- 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
-- 	"dataset_id" uuid NOT NULL,
-- 	"project_id" uuid NOT NULL,
-- 	"status" text NOT NULL,
-- 	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
-- 	CONSTRAINT "dataset_export_jobs_project_dataset_key" UNIQUE("dataset_id","project_id")
-- );
--> statement-breakpoint
-- CREATE TABLE "dataset_parquets" (
-- 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
-- 	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
-- 	"dataset_id" uuid NOT NULL,
-- 	"parquet_path" text NOT NULL,
-- 	"job_id" uuid NOT NULL,
-- 	"name" text,
-- 	"project_id" uuid NOT NULL
-- );
--> statement-breakpoint
CREATE TABLE "event_cluster_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_name" text NOT NULL,
	"value_template" text NOT NULL,
	"project_id" uuid NOT NULL,
	"event_source" text NOT NULL,
	CONSTRAINT "event_cluster_configs_project_id_event_name_source_key" UNIQUE("event_name","project_id","event_source")
);
--> statement-breakpoint
CREATE TABLE "event_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"project_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"level" integer NOT NULL,
	"parent_id" uuid,
	"num_children_clusters" bigint NOT NULL,
	"num_events" bigint NOT NULL,
	"centroid" jsonb NOT NULL,
	"name" text NOT NULL,
	"event_name" text NOT NULL,
	"event_source" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "semantic_event_definitions" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"structured_output_schema" jsonb NOT NULL,
	CONSTRAINT "semantic_event_definitions_pkey" PRIMARY KEY("id","project_id"),
	CONSTRAINT "semantic_event_definitions_project_id_name_key" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "semantic_event_trigger_spans" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"span_name" text NOT NULL,
	"event_definition_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	CONSTRAINT "semantic_event_trigger_spans_pkey" PRIMARY KEY("id","project_id"),
	CONSTRAINT "semantic_event_trigger_spans_project_event_definition_span_key" UNIQUE("project_id","span_name","event_definition_id")
);
--> statement-breakpoint
CREATE TABLE "slack_channel_to_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"integration_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slack_channel_to_events_integration_channel_event_key" UNIQUE("channel_id","event_name","integration_id")
);
--> statement-breakpoint
CREATE TABLE "slack_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"token" text NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nonce_hex" text NOT NULL,
	CONSTRAINT "slack_integrations_project_id_key" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "user_subscription_tiers" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "user_subscription_tiers_id_seq" INCREMENT BY 1 MINVALUE 1 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"stripe_product_id" text DEFAULT '' NOT NULL,
	"index_chat_messages" bigint DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "user_usage" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"index_chat_message_count" bigint DEFAULT '0' NOT NULL,
	"index_chat_message_count_since_reset" bigint DEFAULT '0' NOT NULL,
	"prev_index_chat_message_count" bigint DEFAULT '0' NOT NULL,
	"reset_time" timestamp with time zone DEFAULT now() NOT NULL,
	"reset_reason" text DEFAULT 'signup' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_deployments" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'CLOUD' NOT NULL,
	"private_key" text DEFAULT '' NOT NULL,
	"private_key_nonce" text DEFAULT '' NOT NULL,
	"public_key" text DEFAULT '' NOT NULL,
	"data_plane_url" text DEFAULT '' NOT NULL,
	"data_plane_url_nonce" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluation_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "spans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "traces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tag_classes" DROP CONSTRAINT "label_classes_name_project_id_unique";--> statement-breakpoint
ALTER TABLE "traces" DROP CONSTRAINT "traces_project_id_id_unique";--> statement-breakpoint
DROP INDEX "spans_project_id_start_time_idx";--> statement-breakpoint
ALTER TABLE "shared_traces" ALTER COLUMN "project_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'traces'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

ALTER TABLE "traces" DROP CONSTRAINT "traces_pkey";--> statement-breakpoint
ALTER TABLE "traces" ADD CONSTRAINT "traces_pkey" PRIMARY KEY("id","project_id");--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "class_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_chats" ADD CONSTRAINT "agent_chats_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("session_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "agent_chats" ADD CONSTRAINT "agent_chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("session_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_export_jobs" ADD CONSTRAINT "dataset_export_jobs_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_export_jobs" ADD CONSTRAINT "dataset_export_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_parquets" ADD CONSTRAINT "dataset_parquets_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_parquets" ADD CONSTRAINT "dataset_parquets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_cluster_configs" ADD CONSTRAINT "event_cluster_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_clusters" ADD CONSTRAINT "event_clusters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "semantic_event_definitions" ADD CONSTRAINT "semantic_event_definitions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "semantic_event_trigger_spans" ADD CONSTRAINT "semantic_event_trigger_spans_event_definition_id_project_i_fkey" FOREIGN KEY ("project_id","event_definition_id") REFERENCES "public"."semantic_event_definitions"("id","project_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "slack_channel_to_events" ADD CONSTRAINT "slack_channel_to_events_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."slack_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_integrations" ADD CONSTRAINT "slack_integrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_usage" ADD CONSTRAINT "user_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "agent_chats_created_at_idx" ON "agent_chats" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "agent_chats_updated_at_idx" ON "agent_chats" USING btree ("updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "agent_chats_user_id_idx" ON "agent_chats" USING hash ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "agent_messages_session_id_created_at_idx" ON "agent_messages" USING btree ("created_at" timestamptz_ops,"session_id" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "agent_sessions_created_at_idx" ON "agent_sessions" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "agent_sessions_updated_at_idx" ON "agent_sessions" USING btree ("updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "clusters_project_id_level_idx" ON "clusters" USING btree ("project_id" int8_ops,"level" uuid_ops);--> statement-breakpoint
CREATE INDEX "clusters_project_id_name_idx" ON "clusters" USING btree ("project_id" uuid_ops);--> statement-breakpoint
ALTER TABLE "event_definitions" ADD CONSTRAINT "event_definitions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_span_id_project_id_idx" ON "events" USING btree ("project_id" uuid_ops,"span_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "spans_root_project_id_start_time_trace_id_idx" ON "spans" USING btree ("project_id" uuid_ops,"start_time" uuid_ops,"trace_id" uuid_ops) WHERE (parent_span_id IS NULL);--> statement-breakpoint
CREATE INDEX "spans_project_id_start_time_idx" ON "spans" USING btree ("project_id" uuid_ops,"start_time" timestamptz_ops);--> statement-breakpoint
ALTER TABLE "tag_classes" ADD CONSTRAINT "tag_classes_name_project_id_unique" UNIQUE("name","project_id");--> statement-breakpoint
