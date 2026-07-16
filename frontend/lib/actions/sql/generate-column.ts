import { tool } from "ai";
import { z } from "zod";

import { LaminarToolLoopAgent } from "@/lib/ai/laminar-tool-loop-agent";

import { buildSampleRowsQuery, buildVerifyColumnQuery } from "./column-sql-queries";
import { executeQuery } from "./index";

const GenerateColumnSqlSchema = z.object({
  projectId: z.guid(),
  /** Physical/allowlisted table the column is added to (e.g. "evaluation_datapoints"). */
  table: z.string().min(1),
  /** Scope fragment, e.g. "evaluation_id = {evaluationId:UUID}". Runs through the validator. */
  whereSql: z.string().min(1),
  /** Parameters referenced by whereSql, e.g. { evaluationId }. */
  parameters: z.record(z.string(), z.string()).default({}),
  /** Source columns the agent inspects, e.g. ["data", "target", "metadata"]. */
  sampleColumns: z.array(z.string().min(1)).min(1),
  /** Task-specific instruction (e.g. "extract a human-readable identifier..."). */
  instruction: z.string().min(1),
  dataType: z.enum(["string", "number"]).default("string"),
});

export type GenerateColumnSqlInput = z.infer<typeof GenerateColumnSqlSchema>;

export interface GenerateColumnSqlResult {
  success: boolean;
  sql?: string;
  // Why generation didn't produce sql: "none" = agent found no good identifier
  // (definitive — stop suggesting); "error" = something failed (transient — retry later).
  reason?: "none" | "error";
}

// Runaway guard — write → verify → fix should finish in a handful of steps.
const MAX_STEPS = 8;

const SYSTEM_INSTRUCTIONS = `You write a single ClickHouse SQL *expression* to be used as a custom table column: it is spliced into "SELECT <expression> FROM <table>".

Rules:
- Output an EXPRESSION only — no SELECT, no AS alias, no semicolons, no trailing clauses.
- You are given a few example rows. Use the verifyColumnSql tool to run your candidate against real data: it evaluates "SELECT <expression> AS value FROM <table> LIMIT 5" and returns the resulting values or the ClickHouse error.
- Iterate until the expression runs with NO error and produces useful, non-empty values for most rows.
- Prefer concise, robust expressions. When extracting from JSON string columns use simpleJSONExtractString / simpleJSONExtractRaw. Guard against missing keys (e.g. coalesce / nullIf) so the value is rarely empty.
- When you are confident, call submitColumnSql with the final verified expression. Only submit an expression you have successfully verified.
- If no useful expression is possible, submit nothing.`;

const buildUserPrompt = (input: GenerateColumnSqlInput, sampleRows: unknown[]): string =>
  [
    input.instruction.trim(),
    `Target table: ${input.table}. Source columns available: ${input.sampleColumns.join(", ")}.`,
    `Example rows (up to 5):`,
    "```json",
    JSON.stringify(sampleRows, null, 2),
    "```",
    "Test candidate expressions with verifyColumnSql, then call submitColumnSql with the final expression.",
  ].join("\n\n");

/**
 * Agentic generator for a custom column SQL expression. Mirrors the
 * render-template generation agent: a ToolLoopAgent iterates with a verify tool
 * that runs candidate SQL against real example rows (through the validator-
 * enforced executeQuery), then submits a verified expression. Returns
 * { success: false } when the agent finds nothing usable or errors.
 */
export const generateColumnSql = async (
  input: GenerateColumnSqlInput,
  signal?: AbortSignal
): Promise<GenerateColumnSqlResult> => {
  const parsed = GenerateColumnSqlSchema.parse(input);
  const { projectId, table, whereSql, parameters, sampleColumns } = parsed;

  const runVerify = async (expression: string) => {
    try {
      const rows = await executeQuery<Record<string, unknown>>({
        projectId,
        query: buildVerifyColumnQuery({ table, expression, whereSql }),
        parameters,
      });
      return { ok: true as const, rows };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  };

  // Fetch example rows the agent reasons over. On failure / no data we can't
  // generate now — treat as transient so it retries later.
  let sampleRows: Record<string, unknown>[];
  try {
    sampleRows = await executeQuery<Record<string, unknown>>({
      projectId,
      query: buildSampleRowsQuery({ table, sampleColumns, whereSql }),
      parameters,
    });
  } catch {
    return { success: false, reason: "error" };
  }
  if (sampleRows.length === 0) return { success: false, reason: "error" };

  let submitted: string | null = null;
  let agentErrored = false;

  const agent = new LaminarToolLoopAgent({
    name: "generateColumnSql",
    tier: "medium",
    maxSteps: MAX_STEPS,
    metadata: { feature: "column-suggestion", projectId, table },
    instructions: SYSTEM_INSTRUCTIONS,
    tools: {
      verifyColumnSql: tool({
        description:
          "Run a candidate column expression against the example rows. Returns { ok, rows } or { ok: false, error }.",
        inputSchema: z.object({ sql: z.string().min(1) }),
        execute: async ({ sql }) => runVerify(sql),
      }),
      submitColumnSql: tool({
        description:
          "Submit the final, verified column expression. Rejected (with an error) if it does not run cleanly.",
        inputSchema: z.object({ sql: z.string().min(1) }),
        execute: async ({ sql }) => {
          const trimmed = sql.trim();
          const res = await runVerify(trimmed);
          if (!res.ok) return { ok: false as const, error: res.error };
          submitted = trimmed;
          return { ok: true as const };
        },
      }),
    },
  });
  try {
    await agent.run(buildUserPrompt(parsed, sampleRows), { abortSignal: signal });
  } catch {
    // Provider / network error or client-disconnect abort mid-run — transient,
    // let the caller retry. Nothing is persisted.
    agentErrored = true;
  }

  if (submitted) return { success: true, sql: submitted };
  return { success: false, reason: agentErrored ? "error" : "none" };
};
