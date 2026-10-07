-- `span_names` / `tags` signal filters move from the single-name `eq`/`ne`
-- shape to the list-valued `includes` / `not_includes` shape.
--
-- Behaviour-preserving: `eq "x"` and `includes ["x"]` agree, as do `ne "x"` and
-- `not_includes ["x"]` (see `migration_preserves_behaviour` in db/utils.rs).
-- `eq`/`ne` only ever carried a single string (the UI paired arrays with
-- `includes`, and the CRUD validator rejected them), so the value always wraps.
-- WITH ORDINALITY + ORDER BY keeps filter order stable; the evaluator ANDs them
-- so order is cosmetic, but a reordered array would show up as a spurious diff.
UPDATE "signal_triggers" SET "filters" = (
  SELECT jsonb_agg(
    CASE
      WHEN f->>'column' IN ('span_names', 'tags') AND f->>'operator' IN ('eq', 'ne')
      THEN jsonb_build_object(
        'column', f->>'column',
        'operator', CASE WHEN f->>'operator' = 'eq' THEN 'includes' ELSE 'not_includes' END,
        'value', jsonb_build_array(f->>'value'),
        'dataType', 'array'
      )
      ELSE f
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements("filters") WITH ORDINALITY AS t(f, ord)
)
WHERE jsonb_typeof("filters") = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("filters") AS c
    WHERE c->>'column' IN ('span_names', 'tags') AND c->>'operator' IN ('eq', 'ne')
  );
