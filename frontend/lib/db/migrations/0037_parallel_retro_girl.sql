ALTER TABLE "agent_sessions" ALTER COLUMN "session_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "traces" ALTER COLUMN "visibility" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "workspace_invitations" ALTER COLUMN "workspace_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "workspace_invitations" ALTER COLUMN "email" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "traces" ADD COLUMN "user_id" text;--> statement-breakpoint
CREATE INDEX "spans_partial_evaluator_trace_id_project_id_start_time_span_id_" ON "spans" USING btree ("trace_id" uuid_ops,"project_id" uuid_ops,"start_time" timestamptz_ops,"span_id" uuid_ops) WHERE (span_type = 'EVALUATOR'::span_type);--> statement-breakpoint
CREATE INDEX "spans_partial_executor_trace_id_project_id_start_time_span_id_i" ON "spans" USING btree ("trace_id" uuid_ops,"project_id" uuid_ops,"start_time" timestamptz_ops,"span_id" uuid_ops) WHERE (span_type = 'EXECUTOR'::span_type);--> statement-breakpoint
CREATE INDEX "spans_project_id_created_at_idx" ON "spans" USING btree ("project_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "spans_project_id_start_time_idx" ON "spans" USING btree ("project_id" uuid_ops,"start_time" timestamptz_ops);--> statement-breakpoint
