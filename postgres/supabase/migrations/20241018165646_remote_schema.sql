drop policy "select_by_next_api_key" on "public"."evaluation_results";

drop policy "select_by_next_api_key" on "public"."evaluations";

drop policy "select_by_next_api_key" on "public"."traces";

alter table "public"."provider_api_keys" drop column "shorthand";

create policy "select_by_next_api_key"
on "public"."evaluation_results"
as permissive
for select
to anon, authenticated
using (is_evaluation_id_accessible_for_api_key(api_key(), evaluation_id));


create policy "select_by_next_api_key"
on "public"."evaluations"
as permissive
for select
to anon, authenticated
using (is_evaluation_id_accessible_for_api_key(api_key(), id));


create policy "select_by_next_api_key"
on "public"."traces"
as permissive
for select
to anon, authenticated
using (is_trace_id_accessible_for_api_key(api_key(), id));



