// Pure decision logic for proactive column suggestions (e.g. the eval-table
// "Label" column). Reusable across tables: a table registers one or more
// ColumnSuggestions and this function decides, given the already-present
// columns and per-suggestion persisted state, which to render now and which
// still need generating. No React / no IO here so it's unit-testable.

/** A single suggestion a table can offer. `generate` produces the column SQL. */
export interface ColumnSuggestion {
  /** Stable id, used as the localStorage key suffix (e.g. "label"). */
  id: string;
  /** Display name of the resulting column (e.g. "Label"). */
  name: string;
  dataType: "string" | "number";
  /** Produce the column SQL expression, or null when no good suggestion exists.
   *  THROW on a transient failure (network / backend) so the hook leaves the
   *  suggestion unseen and retries next mount instead of resolving it forever.
   *  Receives an AbortSignal so the hook can cancel an in-flight generation. */
  generate: (signal: AbortSignal) => Promise<{ sql: string } | null>;
}

/**
 * Per-suggestion persisted state (localStorage), keyed by suggestion id:
 * - `pending` carries the generated sql so a reload reuses it instead of
 *   re-running the (expensive) generator.
 * - `resolved` means the user kept or discarded it — never surface again.
 *   `name`/`dataType` are fixed per suggestion so they are not stored.
 */
export type SuggestionRecord = { status: "pending"; sql: string } | { status: "resolved" };

export const pendingRecord = (sql: string): SuggestionRecord => ({ status: "pending", sql });
export const resolvedRecord = (): SuggestionRecord => ({ status: "resolved" });

export interface ResolveInput {
  suggestions: ColumnSuggestion[];
  /** Names of columns already present on the table (custom + built-in). */
  existingColumnNames: string[];
  /** suggestionKeys of custom columns already present (kept-and-saved guard;
   *  survives a rename, and works cross-user via the persisted view config). */
  existingSuggestionKeys: string[];
  /** Persisted record per suggestion id. */
  persisted: Record<string, SuggestionRecord | undefined>;
  /** True in contexts where suggestions must never appear (e.g. shared evals). */
  disabled: boolean;
}

export interface SuggestionResolution {
  /** Ready to render now: a cached-pending suggestion and its sql. */
  toShow: Array<{ suggestion: ColumnSuggestion; sql: string }>;
  /** Eligible but not yet generated — the hook should run `generate`. */
  toGenerate: ColumnSuggestion[];
}

export function resolveColumnSuggestions(input: ResolveInput): SuggestionResolution {
  const { suggestions, existingColumnNames, existingSuggestionKeys, persisted, disabled } = input;
  const result: SuggestionResolution = { toShow: [], toGenerate: [] };
  if (disabled) return result;

  const existingLower = new Set(existingColumnNames.map((n) => n.toLowerCase()));
  const existingKeys = new Set(existingSuggestionKeys);

  for (const suggestion of suggestions) {
    // Already adopted: a column of that name exists, or a kept-and-saved column
    // carries this suggestion's key (cross-user / survives rename).
    if (existingLower.has(suggestion.name.toLowerCase())) continue;
    if (existingKeys.has(suggestion.id)) continue;
    const record = persisted[suggestion.id];
    if (record?.status === "resolved") continue;
    if (record?.status === "pending") {
      result.toShow.push({ suggestion, sql: record.sql });
      continue;
    }
    result.toGenerate.push(suggestion);
  }

  return result;
}
