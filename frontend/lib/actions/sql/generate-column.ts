import { observe } from "@lmnr-ai/lmnr";
import { Output, stepCountIs, tool, ToolLoopAgent } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";

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

// Runaway guard. Each candidate costs a verify round-trip + an LLM step, so give
// enough budget to iterate a few times AND still answer before the cap.
const MAX_STEPS = 16;

// The agent's final structured answer. Empty `sql` = no useful identifier.
const ColumnSqlOutputSchema = z.object({
  sql: z.string().describe("The final, verified ClickHouse column expression. Empty string if no useful column is possible."),
});

const SYSTEM_INSTRUCTIONS = `You write a single ClickHouse SQL *expression* to be used as a custom table column: it is spliced into "SELECT <expression> FROM <table>".

CRITICAL — stop as soon as you have a good answer:
- Use the verifyColumnSql tool to test a candidate against real data: it evaluates "SELECT <expression> AS value FROM <table> LIMIT 5" and returns the values or the ClickHouse error.
- The MOMENT a candidate verifies with no error and produces sensible, non-empty values that satisfy the request across the sample rows, that candidate IS your answer. Do NOT run more tests and do NOT try to "improve" it.
- You MUST verify your chosen expression before answering. Never answer with an expression you have not just verified.

Rules:
- Output an EXPRESSION only — no SELECT, no AS alias, no semicolons, no trailing clauses.
- Prefer the SIMPLEST expression that satisfies the request. Do NOT add coalesce/if fallback chains, ids, or suffixes to an expression that already works — even if a fallback might help edge cases not present in the samples.
- Only combine fields (coalesce / nullIf) when the simplest expression actually returned empty or unusable values in the samples.
- When extracting from JSON string columns use simpleJSONExtractString / simpleJSONExtractRaw.
- Your final answer is the \`sql\` field. If the request cannot be satisfied with the available columns, answer with an empty string for \`sql\`.`;

const buildUserPrompt = (input: GenerateColumnSqlInput, sampleRows: unknown[]): string =>
  [
    input.instruction.trim(),
    `Target table: ${input.table}. Source columns available: ${input.sampleColumns.join(", ")}.`,
    `Example rows (up to 5):`,
    "```json",
    JSON.stringify(sampleRows, null, 2),
    "```",
    "Test candidate expressions with verifyColumnSql, then return the final verified expression as your answer (the `sql` field).",
  ].join("\n\n");

/**
 * Agentic generator for a custom column SQL expression. A ToolLoopAgent iterates
 * with a verifyColumnSql tool that runs candidates against real example rows
 * (validator-enforced executeQuery), then returns its final expression as
 * structured output. The agent is prompted to only answer with an expression it
 * has verified — we trust that rather than re-running it here.
 * Returns { success: false } when the agent finds nothing usable or errors.
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

  const agent = new ToolLoopAgent({
    model: getLanguageModel("medium"),
    instructions: SYSTEM_INSTRUCTIONS,
    stopWhen: stepCountIs(MAX_STEPS),
    output: Output.object({ schema: ColumnSqlOutputSchema }),
    tools: {
      verifyColumnSql: tool({
        description:
          "Run a candidate column expression against the example rows. Returns { ok, rows } or { ok: false, error }.",
        inputSchema: z.object({ sql: z.string().min(1) }),
        execute: async ({ sql }) => runVerify(sql),
      }),
    },
  });

  let candidate: string | undefined;
  try {
    const result = await observe(
      {
        name: "generateColumnSql",
        // whereSql + its parameters carry the scope (e.g. evaluationId), so any
        // caller's run links back to what it generated for — no eval-specific wiring.
        metadata: { feature: "column-suggestion", projectId, table, whereSql, ...parameters },
      },
      () => agent.generate({ prompt: buildUserPrompt(parsed, sampleRows), abortSignal: signal })
    );
    candidate = result.output?.sql?.trim();
  } catch {
    // Provider / network error or client-disconnect abort mid-run — transient.
    return { success: false, reason: "error" };
  }

  // Empty answer = the agent found no useful identifier (definitive).
  if (!candidate) return { success: false, reason: "none" };
  return { success: true, sql: candidate };
};
