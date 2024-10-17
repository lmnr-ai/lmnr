create table "public"."llm_prices" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "provider" text not null,
    "model" text not null,
    "input_price_per_million" double precision not null,
    "output_price_per_million" double precision not null,
    "input_cached_price_per_million" double precision,
    "additional_prices" jsonb not null default '{}'::jsonb
);


alter table "public"."llm_prices" enable row level security;

create table "public"."registered_labels_for_spans" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "project_id" uuid not null default gen_random_uuid(),
    "path" text not null,
    "label_class_id" uuid not null
);


alter table "public"."registered_labels_for_spans" enable row level security;

alter table "public"."label_classes" add column "evaluator_runnable_graph" jsonb;

CREATE UNIQUE INDEX registered_labels_for_spans_pkey ON public.registered_labels_for_spans USING btree (id);

CREATE UNIQUE INDEX labels_span_id_class_id_user_id_key ON public.labels USING btree (span_id, class_id, user_id) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX llm_prices_pkey ON public.llm_prices USING btree (id);

CREATE UNIQUE INDEX unique_project_id_path_label_class ON public.registered_labels_for_spans USING btree (project_id, path, label_class_id);

alter table "public"."llm_prices" add constraint "llm_prices_pkey" PRIMARY KEY using index "llm_prices_pkey";

alter table "public"."registered_labels_for_spans" add constraint "registered_labels_for_spans_pkey" PRIMARY KEY using index "registered_labels_for_spans_pkey";

alter table "public"."labels" add constraint "labels_span_id_class_id_user_id_key" UNIQUE using index "labels_span_id_class_id_user_id_key";

alter table "public"."labels" add constraint "trace_tags_span_id_fkey" FOREIGN KEY (span_id) REFERENCES spans(span_id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."labels" validate constraint "trace_tags_span_id_fkey";

alter table "public"."labels" add constraint "trace_tags_type_id_fkey" FOREIGN KEY (class_id) REFERENCES label_classes(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."labels" validate constraint "trace_tags_type_id_fkey";

alter table "public"."projects" add constraint "projects_organization_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."projects" validate constraint "projects_organization_id_fkey";

alter table "public"."registered_labels_for_spans" add constraint "registered_labels_for_spans_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."registered_labels_for_spans" validate constraint "registered_labels_for_spans_project_id_fkey";

alter table "public"."registered_labels_for_spans" add constraint "unique_project_id_path_label_class" UNIQUE using index "unique_project_id_path_label_class";

alter table "public"."spans" add constraint "new_spans_trace_id_fkey" FOREIGN KEY (trace_id) REFERENCES traces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."spans" validate constraint "new_spans_trace_id_fkey";

grant delete on table "public"."llm_prices" to "anon";

grant insert on table "public"."llm_prices" to "anon";

grant references on table "public"."llm_prices" to "anon";

grant select on table "public"."llm_prices" to "anon";

grant trigger on table "public"."llm_prices" to "anon";

grant truncate on table "public"."llm_prices" to "anon";

grant update on table "public"."llm_prices" to "anon";

grant delete on table "public"."llm_prices" to "authenticated";

grant insert on table "public"."llm_prices" to "authenticated";

grant references on table "public"."llm_prices" to "authenticated";

grant select on table "public"."llm_prices" to "authenticated";

grant trigger on table "public"."llm_prices" to "authenticated";

grant truncate on table "public"."llm_prices" to "authenticated";

grant update on table "public"."llm_prices" to "authenticated";

grant delete on table "public"."llm_prices" to "service_role";

grant insert on table "public"."llm_prices" to "service_role";

grant references on table "public"."llm_prices" to "service_role";

grant select on table "public"."llm_prices" to "service_role";

grant trigger on table "public"."llm_prices" to "service_role";

grant truncate on table "public"."llm_prices" to "service_role";

grant update on table "public"."llm_prices" to "service_role";

grant delete on table "public"."registered_labels_for_spans" to "anon";

grant insert on table "public"."registered_labels_for_spans" to "anon";

grant references on table "public"."registered_labels_for_spans" to "anon";

grant select on table "public"."registered_labels_for_spans" to "anon";

grant trigger on table "public"."registered_labels_for_spans" to "anon";

grant truncate on table "public"."registered_labels_for_spans" to "anon";

grant update on table "public"."registered_labels_for_spans" to "anon";

grant delete on table "public"."registered_labels_for_spans" to "authenticated";

grant insert on table "public"."registered_labels_for_spans" to "authenticated";

grant references on table "public"."registered_labels_for_spans" to "authenticated";

grant select on table "public"."registered_labels_for_spans" to "authenticated";

grant trigger on table "public"."registered_labels_for_spans" to "authenticated";

grant truncate on table "public"."registered_labels_for_spans" to "authenticated";

grant update on table "public"."registered_labels_for_spans" to "authenticated";

grant delete on table "public"."registered_labels_for_spans" to "service_role";

grant insert on table "public"."registered_labels_for_spans" to "service_role";

grant references on table "public"."registered_labels_for_spans" to "service_role";

grant select on table "public"."registered_labels_for_spans" to "service_role";

grant trigger on table "public"."registered_labels_for_spans" to "service_role";

grant truncate on table "public"."registered_labels_for_spans" to "service_role";

grant update on table "public"."registered_labels_for_spans" to "service_role";


