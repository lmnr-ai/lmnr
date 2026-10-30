import { type ChangeSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { clickhouse, type DialectOptions, formatDialect } from "sql-formatter";

import { toast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

// WITH FILL and its TO/STEP modifiers aren't clauses in the stock dialect, so they'd be split mid-expression.
const dialect: DialectOptions = {
  ...clickhouse,
  tokenizerOptions: {
    ...clickhouse.tokenizerOptions,
    reservedClauses: [...clickhouse.tokenizerOptions.reservedClauses, "WITH FILL", "TO", "STEP"],
  },
  formatOptions: {
    ...clickhouse.formatOptions,
    onelineClauses: [...(clickhouse.formatOptions.onelineClauses ?? []), "FROM", "WITH FILL", "TO", "STEP", "SETTINGS"],
  },
};

const withoutWhitespace = (sql: string) => sql.replace(/\s+/g, "");

/** Throws on SQL the formatter can't parse. Keyword case is preserved: ClickHouse identifiers are case-sensitive. */
export function formatSql(sql: string): string {
  const formatted = formatDialect(sql, { dialect, tabWidth: 4, expressionWidth: 120 });
  // Formatting must only move whitespace; anything else risks changing the query's meaning.
  if (withoutWhitespace(formatted) !== withoutWhitespace(sql)) {
    throw new Error("Formatting would change the query");
  }
  return formatted;
}

const isWhitespace = (char: string | undefined) => char !== undefined && /\s/.test(char);

/** Edits that turn `from` into `to`, given that the two differ only in whitespace. */
function whitespaceChanges(from: string, to: string): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  let i = 0;
  let j = 0;
  while (i <= from.length && j <= to.length) {
    const start = i;
    const insertStart = j;
    while (isWhitespace(from[i])) i++;
    while (isWhitespace(to[j])) j++;
    const insert = to.slice(insertStart, j);
    if (from.slice(start, i) !== insert) changes.push({ from: start, to: i, insert });
    // Past the whitespace run both strings hold the same character.
    i++;
    j++;
  }
  return changes;
}

/** Formats in place as whitespace-only edits, so the cursor and scroll position stay on the same code. */
export function formatView(view: EditorView) {
  const sql = view.state.doc.toString();
  if (!sql.trim()) return;
  try {
    const formatted = formatSql(sql);
    const changes = view.state.changes(whitespaceChanges(sql, formatted));
    // Never trust the diff blindly: if it doesn't reproduce the formatted text, replace the document.
    const exact = changes.apply(view.state.doc).toString() === formatted;
    view.dispatch({ changes: exact ? changes : { from: 0, to: sql.length, insert: formatted } });
    track("sql_editor", "formatted");
  } catch (error) {
    toast({
      title: "Couldn't format SQL",
      description: error instanceof Error ? error.message.split("\n")[0] : undefined,
      variant: "destructive",
    });
  }
}

// Matched on the physical key: CodeMirror keymaps skip Option combos on macOS, where ⇧⌥F types `Ï`.
export const formatShortcut = EditorView.domEventHandlers({
  keydown: (event, view) => {
    if (event.code !== "KeyF" || !event.shiftKey || !event.altKey || event.metaKey || event.ctrlKey) return false;
    event.preventDefault();
    formatView(view);
    return true;
  },
});
