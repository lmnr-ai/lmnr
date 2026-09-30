-- Legacy `root_span_finished` + `span_name` triggers become a root-span trigger
-- with a `span_names` filter.
--
-- Before 0105 a trigger was one AND-ed list and `span_name` meant "the trace has
-- this span anywhere", so the drawer's default `root_span_finished` plus a span
-- name read "the root finished and the trace contains X". 0105 kept both in
-- `value`, where `span_name` is now batch-scoped: the pair fires only when the
-- root span and the named span land in the SAME ingest batch, which a
-- long-running trace almost never does — the signal silently stops. The API and
-- drawer show such a row as a plain span-name trigger, hiding the AND.
--
-- Behaviour-preserving: `span_names` filters are trace-cumulative, exactly the
-- old condition. Values take the 0107 filter shape; blank names are dropped.
-- Rows with an unsupported operator or only blank names never fired, and are
-- left alone rather than turned into a live filter. `signal_versions` gets the
-- same rewrite so the next edit doesn't diff a trigger change nobody made.
UPDATE "signal_triggers" SET
  "value" = '[{"column":"root_span_finished","operator":"eq","value":"true"}]'::jsonb,
  "filters" = "filters" || (
    SELECT jsonb_agg(
      jsonb_build_object(
        'column', 'span_names',
        'operator', CASE WHEN c->>'operator' IN ('ne', 'not_includes') THEN 'not_includes' ELSE 'includes' END,
        'value', (
          SELECT jsonb_agg(n ORDER BY n_ord)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(c->'value') = 'array' THEN c->'value' ELSE jsonb_build_array(c->'value') END
          ) WITH ORDINALITY AS names(n, n_ord)
          WHERE jsonb_typeof(n) = 'string' AND btrim(n #>> '{}') <> ''
        ),
        'dataType', 'array'
      )
      ORDER BY ord
    )
    FROM jsonb_array_elements("value") WITH ORDINALITY AS t(c, ord)
    WHERE c->>'column' = 'span_name'
  )
WHERE jsonb_typeof("value") = 'array'
  AND jsonb_typeof("filters") = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("value") AS c
    WHERE c->>'column' = 'root_span_finished'
  )
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("value") AS c
    WHERE c->>'column' = 'span_name'
  )
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements("value") AS c
    WHERE c->>'column' = 'span_name'
      AND (
        c->>'operator' IS NULL
        OR c->>'operator' NOT IN ('eq', 'ne', 'includes', 'not_includes')
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(c->'value') = 'array' THEN c->'value' ELSE jsonb_build_array(c->'value') END
          ) AS n
          WHERE jsonb_typeof(n) = 'string' AND btrim(n #>> '{}') <> ''
        )
      )
  );--> statement-breakpoint
UPDATE "signal_versions" SET "definition" = "definition" || jsonb_build_object(
  'trigger', '[{"column":"root_span_finished","operator":"eq","value":"true"}]'::jsonb,
  'filters', COALESCE("definition"->'filters', '[]'::jsonb) || (
    SELECT jsonb_agg(
      jsonb_build_object(
        'column', 'span_names',
        'operator', CASE WHEN c->>'operator' IN ('ne', 'not_includes') THEN 'not_includes' ELSE 'includes' END,
        'value', (
          SELECT jsonb_agg(n ORDER BY n_ord)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(c->'value') = 'array' THEN c->'value' ELSE jsonb_build_array(c->'value') END
          ) WITH ORDINALITY AS names(n, n_ord)
          WHERE jsonb_typeof(n) = 'string' AND btrim(n #>> '{}') <> ''
        ),
        'dataType', 'array'
      )
      ORDER BY ord
    )
    FROM jsonb_array_elements("definition"->'trigger') WITH ORDINALITY AS t(c, ord)
    WHERE c->>'column' = 'span_name'
  )
)
WHERE jsonb_typeof("definition"->'trigger') = 'array'
  AND COALESCE(jsonb_typeof("definition"->'filters'), 'array') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("definition"->'trigger') AS c
    WHERE c->>'column' = 'root_span_finished'
  )
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("definition"->'trigger') AS c
    WHERE c->>'column' = 'span_name'
  )
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements("definition"->'trigger') AS c
    WHERE c->>'column' = 'span_name'
      AND (
        c->>'operator' IS NULL
        OR c->>'operator' NOT IN ('eq', 'ne', 'includes', 'not_includes')
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(c->'value') = 'array' THEN c->'value' ELSE jsonb_build_array(c->'value') END
          ) AS n
          WHERE jsonb_typeof(n) = 'string' AND btrim(n #>> '{}') <> ''
        )
      )
  );
