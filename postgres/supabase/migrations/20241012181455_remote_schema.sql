create type "public"."label_job_status" as enum ('RUNNING', 'DONE');

revoke delete on table "public"."messages" from "anon";

revoke insert on table "public"."messages" from "anon";

revoke references on table "public"."messages" from "anon";

revoke select on table "public"."messages" from "anon";

revoke trigger on table "public"."messages" from "anon";

revoke truncate on table "public"."messages" from "anon";

revoke update on table "public"."messages" from "anon";

revoke delete on table "public"."messages" from "authenticated";

revoke insert on table "public"."messages" from "authenticated";

revoke references on table "public"."messages" from "authenticated";

revoke select on table "public"."messages" from "authenticated";

revoke trigger on table "public"."messages" from "authenticated";

revoke truncate on table "public"."messages" from "authenticated";

revoke update on table "public"."messages" from "authenticated";

revoke delete on table "public"."messages" from "service_role";

revoke insert on table "public"."messages" from "service_role";

revoke references on table "public"."messages" from "service_role";

revoke select on table "public"."messages" from "service_role";

revoke trigger on table "public"."messages" from "service_role";

revoke truncate on table "public"."messages" from "service_role";

revoke update on table "public"."messages" from "service_role";

revoke delete on table "public"."old_traces" from "anon";

revoke insert on table "public"."old_traces" from "anon";

revoke references on table "public"."old_traces" from "anon";

revoke select on table "public"."old_traces" from "anon";

revoke trigger on table "public"."old_traces" from "anon";

revoke truncate on table "public"."old_traces" from "anon";

revoke update on table "public"."old_traces" from "anon";

revoke delete on table "public"."old_traces" from "authenticated";

revoke insert on table "public"."old_traces" from "authenticated";

revoke references on table "public"."old_traces" from "authenticated";

revoke select on table "public"."old_traces" from "authenticated";

revoke trigger on table "public"."old_traces" from "authenticated";

revoke truncate on table "public"."old_traces" from "authenticated";

revoke update on table "public"."old_traces" from "authenticated";

revoke delete on table "public"."old_traces" from "service_role";

revoke insert on table "public"."old_traces" from "service_role";

revoke references on table "public"."old_traces" from "service_role";

revoke select on table "public"."old_traces" from "service_role";

revoke trigger on table "public"."old_traces" from "service_role";

revoke truncate on table "public"."old_traces" from "service_role";

revoke update on table "public"."old_traces" from "service_role";

revoke delete on table "public"."user_limits" from "anon";

revoke insert on table "public"."user_limits" from "anon";

revoke references on table "public"."user_limits" from "anon";

revoke select on table "public"."user_limits" from "anon";

revoke trigger on table "public"."user_limits" from "anon";

revoke truncate on table "public"."user_limits" from "anon";

revoke update on table "public"."user_limits" from "anon";

revoke delete on table "public"."user_limits" from "authenticated";

revoke insert on table "public"."user_limits" from "authenticated";

revoke references on table "public"."user_limits" from "authenticated";

revoke select on table "public"."user_limits" from "authenticated";

revoke trigger on table "public"."user_limits" from "authenticated";

revoke truncate on table "public"."user_limits" from "authenticated";

revoke update on table "public"."user_limits" from "authenticated";

revoke delete on table "public"."user_limits" from "service_role";

revoke insert on table "public"."user_limits" from "service_role";

revoke references on table "public"."user_limits" from "service_role";

revoke select on table "public"."user_limits" from "service_role";

revoke trigger on table "public"."user_limits" from "service_role";

revoke truncate on table "public"."user_limits" from "service_role";

revoke update on table "public"."user_limits" from "service_role";

alter table "public"."messages" drop constraint "messages_pkey";

drop index if exists "public"."messages_run_id_idx";

alter table "public"."labels" drop constraint "trace_tags_span_id_fkey";

alter table "public"."spans" drop constraint "new_spans_pkey";
drop index if exists "public"."new_spans_pkey";

alter table "public"."spans" drop constraint "new_spans_trace_id_fkey";
alter table "public"."traces" drop constraint "new_traces_pkey";
drop index if exists "public"."new_traces_pkey";

drop index if exists "public"."new_traces_session_id_idx";

alter table "public"."projects" drop constraint "projects_organization_id_fkey";
alter table "public"."members_of_workspaces" drop constraint "public_members_of_workspaces_workspace_id_fkey";
alter table "public"."workspaces" drop constraint "organizations_pkey";
drop index if exists "public"."organizations_pkey";

alter table "public"."labels" drop constraint "trace_tags_type_id_fkey";
alter table "public"."label_classes" drop constraint "tag_types_pkey";
drop index if exists "public"."tag_types_pkey";

drop index if exists "public"."traces_pipeline_version_id_idx";

drop index if exists "public"."traces_run_type_idx";

alter table "public"."user_limits" drop constraint "user_limits_pkey";
drop index if exists "public"."user_limits_pkey";

alter table "public"."messages" drop constraint "messages_run_id_fkey";

alter table "public"."old_traces" drop constraint "traces_pipeline_version_id_fkey";

alter table "public"."pipeline_versions" drop constraint "pipeline_versions_pipeline_id_fkey";

alter table "public"."user_limits" drop constraint "user_limits_user_id_fkey";

alter table "public"."labels" drop constraint "labels_span_id_class_id_user_id_key";

alter table "public"."old_traces" drop constraint "traces_pkey";

drop table "public"."messages";

drop table "public"."old_traces";

alter table "public"."evaluation_results" drop column "status";

alter table "public"."evaluations" drop column "status";

alter table "public"."labels" add column "job_status" label_job_status;

alter table "public"."labels" add column "reasoning" text;

alter table "public"."labels" alter column "value" drop not null;

drop type "public"."evaluation_job_status";

drop type "public"."evaluation_status";

CREATE UNIQUE INDEX label_classes_pkey ON public.label_classes USING btree (id);

CREATE UNIQUE INDEX spans_pkey ON public.spans USING btree (span_id);

CREATE UNIQUE INDEX labels_span_id_class_id_user_id_key ON public.labels USING btree (span_id, class_id, user_id);

CREATE INDEX spans_start_time_end_time_idx ON public.spans USING btree (start_time, end_time);

CREATE INDEX spans_textsearch_input_plus_output_english ON public.spans USING gin (to_tsvector('english'::regconfig, (((input)::text || ' '::text) || (output)::text)));

CREATE INDEX spans_trace_id_idx ON public.spans USING btree (trace_id);

CREATE INDEX traces_project_id_idx ON public.traces USING btree (project_id);

CREATE INDEX traces_session_id_idx ON public.traces USING btree (session_id);

CREATE INDEX traces_start_time_end_time_idx ON public.traces USING btree (start_time, end_time);

CREATE UNIQUE INDEX workspaces_pkey ON public.workspaces USING btree (id);

CREATE UNIQUE INDEX traces_pkey ON public.traces USING btree (id);

alter table "public"."label_classes" add constraint "label_classes_pkey" PRIMARY KEY using index "label_classes_pkey";

alter table "public"."spans" add constraint "spans_pkey" PRIMARY KEY using index "spans_pkey";

alter table "public"."traces" add constraint "traces_pkey" PRIMARY KEY using index "traces_pkey";

alter table "public"."workspaces" add constraint "workspaces_pkey" PRIMARY KEY using index "workspaces_pkey";

alter table "public"."labels" add constraint "labels_span_id_class_id_user_id_key" UNIQUE using index "labels_span_id_class_id_user_id_key";

ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."members_of_workspaces"
    ADD CONSTRAINT "public_members_of_workspaces_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."labels"
    ADD CONSTRAINT "labels_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."label_classes"("id") ON UPDATE CASCADE ON DELETE CASCADE;
