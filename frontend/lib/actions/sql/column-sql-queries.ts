// Pure ClickHouse query construction for the agentic column-SQL generator.
// Kept dependency-free so it's unit-testable; the agent (generate-column.ts)
// composes these and runs them through the validator-enforced executeQuery.

import { generateFingerprint } from "@/lib/actions/spans/previews/utils";

// Structural fingerprint of the sample rows (values stripped, array length ignored)
// via the shared previews fingerprint — the cache key basis for reusing a prior
// generation across evals with the same shape. Fingerprints row[0] only; evals are
// structurally homogeneous, so the first row's shape represents the dataset.
export function sampleFingerprint(row: Record<string, unknown>, cols: string[]): string {
  // "*" (SELECT *) means fingerprint every column present in the row.
  const effectiveCols = cols.includes("*") ? Object.keys(row) : cols;
  const shape: Record<string, unknown> = {};
  for (const col of effectiveCols) {
    const v = row[col];
    if (typeof v === "string" && v !== "") {
      try {
        shape[col] = JSON.parse(v);
      } catch {
        shape[col] = v;
      }
    } else {
      shape[col] = v;
    }
  }
  return generateFingerprint("column-suggestion", shape);
}

/** Number of example rows the agent inspects and verifies candidate SQL against. */
export const SAMPLE_ROW_LIMIT = 5;

export interface SampleRowsQueryOptions {
  table: string;
  /** Source columns shown to the agent, e.g. ["data", "target", "metadata"]. */
  sampleColumns: string[];
  /** Scope fragment, e.g. "evaluation_id = {evaluationId:UUID}". */
  whereSql: string;
}

export function buildSampleRowsQuery({ table, sampleColumns, whereSql }: SampleRowsQueryOptions): string {
  return `SELECT ${sampleColumns.join(", ")} FROM ${table} WHERE ${whereSql} LIMIT ${SAMPLE_ROW_LIMIT}`;
}

export interface VerifyColumnQueryOptions {
  table: string;
  /** Candidate column SQL expression to test. */
  expression: string;
  whereSql: string;
}

export function buildVerifyColumnQuery({ table, expression, whereSql }: VerifyColumnQueryOptions): string {
  return `SELECT ${expression} AS value FROM ${table} WHERE ${whereSql} LIMIT ${SAMPLE_ROW_LIMIT}`;
}
