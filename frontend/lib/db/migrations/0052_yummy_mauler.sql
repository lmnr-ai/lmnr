ALTER TYPE "public"."span_type" ADD VALUE 'EVENT';--> statement-breakpoint
ALTER TYPE "public"."workspace_role" ADD VALUE 'admin';--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE "traces_agent_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traces_agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"chat_id" uuid NOT NULL,
	"trace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traces_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trace_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"summary" text,
	"project_id" uuid NOT NULL,
	"span_ids_map" jsonb
);
--> statement-breakpoint
ALTER TABLE "dashboard_charts" DROP CONSTRAINT "fk_dashboard_charts_project_id";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_span_id_project_id_fkey";
--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "spans" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "spans" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "extra_span_price" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ALTER COLUMN "extra_span_price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "traces_agent_chats" ADD CONSTRAINT "traces_agent_chats_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "traces_agent_messages" ADD CONSTRAINT "traces_agent_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "traces_summaries" ADD CONSTRAINT "traces_summaries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "traces_summaries" ADD CONSTRAINT "traces_summaries_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "dashboard_charts" ADD CONSTRAINT "dashboard_charts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_span_id_idx" ON "events" USING btree ("span_id" uuid_ops);--> statement-breakpoint