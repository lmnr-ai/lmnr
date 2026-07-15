// Pure ClickHouse query construction for the agentic column-SQL generator.
// Kept dependency-free so it's unit-testable; the agent (generate-column.ts)
// composes these and runs them through the validator-enforced executeQuery.

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
