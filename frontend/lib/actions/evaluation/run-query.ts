import { executeQuery } from "@/lib/actions/sql";

import { buildEvalQuery, type EvalQueryOptions, stripTruncatedAliases } from "./query-builder";

// Single chokepoint for the eval datapoints JOIN query: build → execute → rename
// truncated-preview aliases (`truncated:data` → `data`) back to their ids. Both
// the private (getEvaluationDatapoints) and shared (getSharedEvaluationDatapoints)
// paths MUST go through this — when the un-alias step was a per-caller manual line
// the shared path forgot it and preview cells rendered empty. Kept out of
// query-builder.ts so that file stays free of the executeQuery import (which pulls
// server-only deps) and its pure builders remain unit-testable.
export async function runEvalQuery(projectId: string, options: EvalQueryOptions): Promise<Record<string, unknown>[]> {
  const { query, parameters } = buildEvalQuery(options);
  const results = await executeQuery<Record<string, unknown>>({ query, parameters, projectId });
  return stripTruncatedAliases(results);
}
