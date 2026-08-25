// Require a `trace_id` predicate alongside every `span_id` filter on `spans`.
//
// `spans` is ORDER BY (project_id, trace_id, start_time, span_id). A `span_id`
// filter without `trace_id` cannot prune on the primary key: ClickHouse falls
// back to a generic exclusion search over every granule in the project and
// decompresses the heavy input/output/attributes/events columns for all of
// them. Measured locally this was 67/67 granules and ~1.3s vs 27/67 and ~0.4s
// on a tiny dataset, and the gap widens with project size. See
// docs/internal/clickhouse-traces.md.
//
// Flagged: a string or template literal that filters on `span_id` (`=` or `IN`)
// against `spans` and mentions no `trace_id` anywhere in the same literal.
//
// Not flagged:
//   - literals that already mention `trace_id`
//   - `DELETE FROM spans` — a mutation, not a granule scan on the read path
//   - a query whose trace scoping arrives as a structured filter rather than
//     inline SQL; those cannot be seen from the literal, so call sites that
//     scope via `filters`/`customConditions` carry an eslint-disable with a
//     one-line reason.
import { eslintCompatPlugin } from "@oxlint/plugins";

const SPAN_ID_PREDICATE = /\bspan_id\s*(?:=|\bIN\b|\bin\b)/i;
const TRACE_ID = /\btrace_id\b/i;
const FROM_SPANS = /\b(?:FROM|TABLE)\s+spans\b/i;
const DELETE_FROM_SPANS = /\bDELETE\s+FROM\s+spans\b/i;

// The raw text of a string or template literal, with `${...}` holes joined by a
// space so a predicate split across an interpolation still reads as one clause.
const literalText = (node: any): string | null => {
  if (node?.type === "TemplateLiteral") {
    return (node.quasis ?? []).map((q: any) => q?.value?.raw ?? "").join(" ");
  }
  if (node?.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return null;
};

export default eslintCompatPlugin({
  meta: { name: "lmnr-clickhouse" },
  rules: {
    "span-id-needs-trace-id": {
      meta: {
        type: "problem",
        messages: {
          missingTraceId:
            "This span_id filter has no trace_id predicate. `spans` is ORDER BY (project_id, trace_id, start_time, span_id), so without trace_id ClickHouse cannot prune the primary key — it scans every granule in the project and decompresses input/output/attributes/events. Add `trace_id IN ({...:Array(UUID)})` alongside it. If the trace scoping is applied structurally (a `filters` entry or `customConditions`), disable this line with a reason.",
        },
      },
      createOnce(context) {
        const check = (node: any) => {
          const sql = literalText(node);
          if (sql === null) {
            return;
          }
          if (!SPAN_ID_PREDICATE.test(sql) || TRACE_ID.test(sql)) {
            return;
          }
          // A fragment may name no table; it is still a spans predicate when it
          // filters span_id. Only skip when it clearly targets something else.
          if (/\bFROM\s+(?!spans\b)\w+/i.test(sql) && !FROM_SPANS.test(sql)) {
            return;
          }
          if (DELETE_FROM_SPANS.test(sql)) {
            return;
          }
          context.report({ node, messageId: "missingTraceId" });
        };
        return { Literal: check, TemplateLiteral: check };
      },
    },
  },
});
