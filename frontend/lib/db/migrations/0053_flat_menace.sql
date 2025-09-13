ALTER TYPE "public"."label_source" RENAME TO "tag_source";--> statement-breakpoint
DROP POLICY "select_by_next_api_key" ON "agent_chats" CASCADE;--> statement-breakpoint
DROP TABLE "agent_chats" CASCADE;--> statement-breakpoint
DROP TABLE "agent_messages" CASCADE;--> statement-breakpoint
DROP TABLE "agent_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "dataset_parquets" CASCADE;--> statement-breakpoint
DROP TABLE "machines" CASCADE;--> statement-breakpoint
DROP POLICY "all_actions_by_next_api_key" ON "pipeline_versions" CASCADE;--> statement-breakpoint
DROP TABLE "pipeline_versions" CASCADE;--> statement-breakpoint
DROP TABLE "pipelines" CASCADE;--> statement-breakpoint
DROP TABLE "target_pipeline_versions" CASCADE;--> statement-breakpoint
DROP TABLE "user_cookies" CASCADE;--> statement-breakpoint
DROP TABLE "user_subscription_tiers" CASCADE;--> statement-breakpoint
DROP TABLE "user_usage" CASCADE;--> statement-breakpoint
ALTER TABLE "label_classes" RENAME TO "tag_classes";--> statement-breakpoint
ALTER TABLE "labels" RENAME TO "tags";--> statement-breakpoint
ALTER TABLE "tags" RENAME COLUMN "label_source" TO "source";--> statement-breakpoint
ALTER TABLE "evaluation_scores" DROP CONSTRAINT "evaluation_results_names_unique";--> statement-breakpoint
ALTER TABLE "tag_classes" DROP CONSTRAINT "label_classes_project_id_id_key";--> statement-breakpoint
ALTER TABLE "tag_classes" DROP CONSTRAINT "label_classes_name_project_id_unique";--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "labels_span_id_class_id_user_id_key";--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "labels_span_id_class_id_key";--> statement-breakpoint
ALTER TABLE "datasets" DROP CONSTRAINT "public_datasets_project_id_fkey";
--> statement-breakpoint
ALTER TABLE "evaluation_results" DROP CONSTRAINT "evaluation_results_evaluation_id_fkey1";
--> statement-breakpoint
ALTER TABLE "evaluations" DROP CONSTRAINT "evaluations_project_id_fkey1";
--> statement-breakpoint
ALTER TABLE "tag_classes" DROP CONSTRAINT "label_classes_project_id_fkey";
--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "labels_class_id_project_id_fkey";
--> statement-breakpoint
ALTER TABLE "members_of_workspaces" DROP CONSTRAINT "public_members_of_workspaces_workspace_id_fkey";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_tier_id_fkey";
--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "tag_classes" ADD CONSTRAINT "label_classes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_class_id_project_id_fkey" FOREIGN KEY ("class_id","project_id") REFERENCES "public"."tag_classes"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members_of_workspaces" ADD CONSTRAINT "members_of_workspaces_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "tier_id";--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_names_unique_idx" UNIQUE("result_id","name");--> statement-breakpoint
ALTER TABLE "tag_classes" ADD CONSTRAINT "tag_classes_project_id_id_key" UNIQUE("id","project_id");--> statement-breakpoint
ALTER TABLE "tag_classes" ADD CONSTRAINT "tag_classes_name_project_id_unique" UNIQUE("name","project_id");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_span_id_class_id_key" UNIQUE("class_id","span_id");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_span_id_class_id_user_id_key" UNIQUE("class_id","span_id","user_id");--> statement-breakpoint
