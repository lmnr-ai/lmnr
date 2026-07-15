import { type ColumnDef } from "@tanstack/react-table";

import {
  type ActiveSuggestion,
  type ColumnSuggestion,
  SuggestedColumnHeader,
} from "@/components/ui/columns-menu/suggestions";
import { type EvalRow } from "@/lib/evaluation/types";

import { DataCell } from "./columns/data-cell";

export const LABEL_SUGGESTION_ID = "label";
export const LABEL_SUGGESTION_NAME = "Label";

// Ticket 1: deterministic (non-AI) generator so the whole suggestion path is
// demoable end-to-end. Ticket 2 swaps this for the agentic generateColumnSql.
// Tries a few common identifier keys in data/target/metadata, falling back to a
// short prefix of `data` so the column is never empty.
const DETERMINISTIC_LABEL_SQL = [
  "coalesce(",
  "  nullIf(simpleJSONExtractString(data, 'id'), ''),",
  "  nullIf(simpleJSONExtractString(data, 'name'), ''),",
  "  nullIf(simpleJSONExtractString(target, 'id'), ''),",
  "  nullIf(simpleJSONExtractString(metadata, 'id'), ''),",
  "  substring(data, 1, 40)",
  ")",
].join(" ");

/** The eval-table "Label" suggestion. */
export function createLabelSuggestion(): ColumnSuggestion {
  return {
    id: LABEL_SUGGESTION_ID,
    name: LABEL_SUGGESTION_NAME,
    dataType: "string",
    generate: async () => ({ sql: DETERMINISTIC_LABEL_SQL }),
  };
}

/** Build the ephemeral column defs for currently-active suggestions. */
export function buildSuggestedColumnDefs(
  active: ActiveSuggestion[],
  keep: (id: string) => void,
  discard: (id: string) => void
): ColumnDef<EvalRow>[] {
  return active.map(({ suggestion, sql }) => {
    const columnId = `custom:${suggestion.name}`;
    return {
      id: columnId,
      accessorFn: (row) => row[columnId],
      cell: DataCell,
      header: () => (
        <SuggestedColumnHeader
          name={suggestion.name}
          onKeep={() => keep(suggestion.id)}
          onDiscard={() => discard(suggestion.id)}
        />
      ),
      enableSorting: false,
      meta: {
        sql,
        dataType: suggestion.dataType,
        isCustom: true,
        suggested: true,
        // Transient — keep it out of the filter UI and comparison join.
        filterable: false,
        comparable: false,
      },
    };
  });
}
