-- `span_names` filters moved from a single-string eq/ne to a list with includes/notIncludes.
UPDATE "signal_triggers" SET "filters" = (
  SELECT jsonb_agg(
    CASE WHEN f->>'column' = 'span_names' AND f->>'operator' IN ('eq', 'ne')
      THEN f || jsonb_build_object(
        'operator', CASE f->>'operator' WHEN 'eq' THEN 'includes' ELSE 'notIncludes' END,
        'value', jsonb_build_array(f->>'value'),
        'dataType', 'array'
      )
      ELSE f
    END
  )
  FROM jsonb_array_elements("filters") AS f
)
WHERE jsonb_typeof("filters") = 'array' AND "filters" @> '[{"column": "span_names"}]'::jsonb;
