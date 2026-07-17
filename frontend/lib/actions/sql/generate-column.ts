import { observe } from "@lmnr-ai/lmnr";
import { Output, stepCountIs, tool, ToolLoopAgent } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";
import { cache, COLUMN_SUGGESTION_CACHE_KEY } from "@/lib/cache";
import { truncateForPrompt } from "@/lib/utils";

import { buildSampleRowsQuery, buildVerifyColumnQuery, sampleFingerprint } from "./column-sql-queries";
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
  /**
   * Stable suggestion id (e.g. "label"). When set, the generated SQL is cached by
   * (projectId, cacheKey, structural-fingerprint-of-sample-rows) so other evals with
   * the same data/target/metadata shape reuse it without re-running the agent.
   * Omit for ad-hoc "Ask AI" generation (variable instruction ⇒ must not be cached).
   * The cacheKey implicitly pins the instruction; bump it (e.g. "label-v2") if the
   * suggestion's instruction changes, or stale SQL is served for the TTL window.
   */
  cacheKey: z.string().min(1).optional(),
});

export type GenerateColumnSqlInput = z.infer<typeof GenerateColumnSqlSchema>;

export interface GenerateColumnSqlResult {
  success: boolean;
  sql?: string;
  // Why generation didn't produce sql: "none" = agent found no good identifier
  // (definitive — stop suggesting); "error" = something failed (transient — retry later).
  reason?: "none" | "error";
}

// Runaway guard. The agent should answer in ~1-3 verifications; this only caps
// pathological thrashing. Higher values just give a stuck model room to loop.
const MAX_STEPS = 8;

// Cached generated SQL is reused by any eval sharing the sample structure.
const COLUMN_SUGGESTION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// The agent's final structured answer. Empty `sql` = no useful identifier.
const ColumnSqlOutputSchema = z.object({
  sql: z
    .string()
    .describe("The final, verified ClickHouse column expression. Empty string if no useful column is possible."),
});

const SYSTEM_INSTRUCTIONS = `You write a single ClickHouse SQL *expression* to be used as a custom table column: it is spliced into "SELECT <expression> FROM <table>".

The verifyColumnSql tool tests a candidate against real data: it evaluates "SELECT <expression> AS value FROM <table> LIMIT 5" and returns the values or the ClickHouse error.

THE EXAMPLE ROWS ARE THE GROUND TRUTH:
- They show you EVERY key that exists. NEVER reference a JSON key that does not appear in them (no guessing at "task"/"input"/"question"/"title" if they aren't there).
- Decide your answer by reading the rows, not by probing. You should almost always need just ONE verification of your chosen expression.

BE DECISIVE — minimize tool calls:
- The MOMENT a candidate verifies with no error and produces non-empty values that satisfy the request, that candidate IS your answer — submit it immediately. Do NOT keep hunting for a "nicer" field.
- NEVER verify the same (or trivially equivalent) expression twice. If a tool result says you already verified an expression, stop testing and submit it.
- You MUST verify your chosen expression before answering.

WHAT MAKES A GOOD ANSWER — take the FIRST rung that works, don't climb past it:
1. A human-readable label field that is PRESENT in the rows (a name, title, question, key input) — best. Extract it directly.
2. If no such field is present, a stable identifier (id, trace_id, uuid) is a GOOD answer. Wrap it as a self-describing labeled string, e.g. concat('Trace id: ', simpleJSONExtractString(data, 'trace_id')). This is a SINGLE extraction — do NOT precede it with a coalesce chain over human-readable keys that aren't in the rows.
3. Only if NOTHING usable exists, answer with an empty string.

Rules:
- Output an EXPRESSION only — no SELECT, no AS alias, no semicolons, no trailing clauses.
- Prefer the SIMPLEST expression that works — ideally a single extraction. Use coalesce/nullIf ONLY across keys that actually appear in the rows AND that a plain extraction showed to be sometimes-empty.
- When extracting from JSON string columns use simpleJSONExtractString / simpleJSONExtractRaw.
- Your final answer is the \`sql\` field.`;

// Payloads (data/target/metadata) can be enormous — usually STRUCTURAL bloat
// (arrays with hundreds of items), so truncateForPrompt parses each JSON-string
// column and caps string/array/depth, keeping the shape the agent needs small.
const prepareRows = (rows: Record<string, unknown>[]): Record<string, unknown>[] =>
  rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, truncateForPrompt(v)])));

const buildUserPrompt = (input: GenerateColumnSqlInput, sampleRows: unknown[]): string => {
  // With SELECT * the requested list is just ["*"]; surface the real column names
  // from the fetched rows so the agent knows exactly what it can reference.
  const availableColumns = input.sampleColumns.includes("*")
    ? Object.keys((sampleRows[0] as Record<string, unknown> | undefined) ?? {})
    : input.sampleColumns;
  return [
    input.instruction.trim(),
    `Target table: ${input.table}. Source columns available: ${availableColumns.join(", ")}.`,
    `Example rows (up to 5):`,
    "```json",
    JSON.stringify(sampleRows, null, 2),
    "```",
    "Test candidate expressions with verifyColumnSql, then return the final verified expression as your answer (the `sql` field).",
  ].join("\n\n");
};

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
  const { projectId, table, whereSql, parameters, sampleColumns, cacheKey } = parsed;

  // Dedup backstop: gemini re-tests identical expressions (observed thrash), so
  // cache by normalized SQL. A repeat skips the ClickHouse round-trip AND nudges
  // the model to stop and submit instead of looping on the same candidate.
  const verifiedCache = new Map<string, { ok: true; rows: Record<string, unknown>[] } | { ok: false; error: string }>();
  const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

  const runVerify = async (expression: string) => {
    const key = normalize(expression);
    const cached = verifiedCache.get(key);
    if (cached) {
      return {
        ...cached,
        note: "You already verified this exact expression. Stop testing and submit it as your final answer now.",
      };
    }
    let result: { ok: true; rows: Record<string, unknown>[] } | { ok: false; error: string };
    try {
      const rows = await executeQuery<Record<string, unknown>>({
        projectId,
        query: buildVerifyColumnQuery({ table, expression, whereSql }),
        parameters,
      });
      result = { ok: true, rows: prepareRows(rows) };
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    verifiedCache.set(key, result);
    return result;
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
  // No datapoints yet is a normal state (fresh eval), not a failure — return
  // "none" so the client resolves silently instead of toasting on every load.
  if (sampleRows.length === 0) return { success: false, reason: "none" };

  // Structure-keyed cache: reuse a prior generation for the same shape (skips the
  // agent). Best-effort — any cache error falls through to generation. Only keyed
  // when a stable cacheKey is supplied (fixed-instruction suggestions), never for
  // ad-hoc "Ask AI" where the instruction varies per request.
  let fullCacheKey: string | null = null;
  if (cacheKey) {
    try {
      fullCacheKey = COLUMN_SUGGESTION_CACHE_KEY(projectId, cacheKey, sampleFingerprint(sampleRows[0], sampleColumns));
      const hit = await cache.get<string>(fullCacheKey);
      if (hit) return { success: true, sql: hit };
    } catch {
      // Fingerprint / cache read failed — proceed to generation.
    }
  }

  const agent = new ToolLoopAgent({
    model: getLanguageModel("medium"),
    instructions: SYSTEM_INSTRUCTIONS,
    stopWhen: stepCountIs(MAX_STEPS),
    // Deterministic: the task has one right answer per dataset; sampling only
    // adds speculative field-probing and run-to-run variance.
    temperature: 0,
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
  let producedOutput: boolean;
  try {
    const result = await observe(
      {
        name: "generateColumnSql",
        // whereSql + its parameters carry the scope (e.g. evaluationId), so any
        // caller's run links back to what it generated for — no eval-specific wiring.
        metadata: { feature: "column-suggestion", projectId, table, whereSql, ...parameters },
      },
      () => agent.generate({ prompt: buildUserPrompt(parsed, prepareRows(sampleRows)), abortSignal: signal })
    );
    producedOutput = result.output != null;
    candidate = result.output?.sql?.trim();
  } catch {
    // Provider / network error, abort, or the loop ended without a structured
    // answer (e.g. step cap) — all transient, retry next load.
    return { success: false, reason: "error" };
  }

  // Stopped without producing a final answer (step cap / no structured output) —
  // transient, not a definitive "no identifier". Retry rather than suppress.
  if (!producedOutput) return { success: false, reason: "error" };

  // Empty answer = the agent found no useful identifier (definitive). Not cached:
  // "none" is now rare (id fallback almost always yields SQL) and caching a negative
  // would suppress retries for that whole structure.
  if (!candidate) return { success: false, reason: "none" };

  if (fullCacheKey) {
    try {
      await cache.set(fullCacheKey, candidate, { expireAfterSeconds: COLUMN_SUGGESTION_TTL_SECONDS });
    } catch {
      // Best-effort — a failed write just means the next request regenerates.
    }
  }
  return { success: true, sql: candidate };
};
