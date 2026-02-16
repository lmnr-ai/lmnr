import {
  autocompletion,
  type CompletionContext,
  completionKeymap,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { sql } from "@codemirror/lang-sql";
import { Prec } from "@codemirror/state";
import { EditorView, keymap, tooltips } from "@codemirror/view";

import { ClickHouseDialect, clickhouseFunctions } from "@/components/ui/content-renderer/lang-clickhouse";

/**
 * Columns available on the `new_evaluation_datapoints` table.
 * Sourced from the Python query validator's `new_evaluation_datapoints_columns` set.
 */
const newEvaluationDatapointsColumns: { name: string; type: string; description: string }[] = [
  { name: "id", type: "UUID", description: "Unique identifier for the evaluation datapoint" },
  { name: "evaluation_id", type: "UUID", description: "Unique identifier for the evaluation" },
  { name: "data", type: "String", description: "Input data for the evaluation datapoint" },
  { name: "target", type: "String", description: "Target/expected output" },
  { name: "metadata", type: "String", description: "Additional metadata as stringified JSON" },
  { name: "executor_output", type: "String", description: "Output from the executor" },
  { name: "index", type: "Int64", description: "Index of the datapoint within the evaluation" },
  { name: "trace_id", type: "UUID", description: "Unique identifier for the trace" },
  { name: "group_id", type: "String", description: "Group identifier of the evaluation run" },
  { name: "scores", type: "String", description: "Scores as a stringified JSON object from score name to value" },
  { name: "updated_at", type: "DateTime64", description: "When the datapoint was last updated" },
  { name: "created_at", type: "DateTime64", description: "When the datapoint was created" },
  { name: "dataset_id", type: "UUID", description: "Unique identifier for the dataset" },
  { name: "dataset_datapoint_id", type: "UUID", description: "Unique identifier for the dataset datapoint" },
  { name: "dataset_datapoint_created_at", type: "DateTime64", description: "When the dataset datapoint was created" },
  { name: "duration", type: "Float64", description: "Duration in seconds" },
  { name: "input_cost", type: "Float64", description: "Cost for input tokens" },
  { name: "output_cost", type: "Float64", description: "Cost for output tokens" },
  { name: "total_cost", type: "Float64", description: "Total cost" },
  { name: "start_time", type: "DateTime64", description: "When the trace started" },
  { name: "end_time", type: "DateTime64", description: "When the trace ended" },
  { name: "input_tokens", type: "UInt64", description: "Number of input tokens" },
  { name: "output_tokens", type: "UInt64", description: "Number of output tokens" },
  { name: "total_tokens", type: "UInt64", description: "Total tokens used" },
  { name: "trace_status", type: "String", description: "Status of the trace" },
  { name: "trace_metadata", type: "String", description: "Trace metadata as stringified JSON" },
  { name: "trace_tags", type: "String", description: "Tags associated with the trace" },
  { name: "trace_spans", type: "String", description: "Spans of the trace" },
];

const allFunctions = Object.values(clickhouseFunctions).flat();

function expressionCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const search = word.text.toLowerCase();

  const columnOptions = newEvaluationDatapointsColumns
    .filter((col) => col.name.toLowerCase().includes(search))
    .map((col) => ({
      label: col.name,
      type: "property" as const,
      detail: col.type,
      info: col.description,
      boost: col.name.toLowerCase().startsWith(search) ? 1 : 0,
    }));

  const functionOptions = allFunctions
    .filter((fn) => fn.name.toLowerCase().includes(search))
    .map((fn) => ({
      label: fn.name,
      type: "function" as const,
      info: fn.description,
      boost: fn.name.toLowerCase().startsWith(search) ? 1 : 0,
    }));

  const options = [...columnOptions, ...functionOptions];
  if (options.length === 0) return null;

  return { from: word.from, options };
}

export const expressionExtensions = [
  EditorView.theme({
    "&.cm-focused": { outline: "none !important" },
    "&": { fontSize: "0.875rem !important" },
    "&.cm-editor": { height: "100%", width: "100%", position: "relative" },
  }),
  EditorView.lineWrapping,
  tooltips({
    parent: typeof document !== "undefined" ? document.body : undefined,
  }),
  sql({ dialect: ClickHouseDialect, upperCaseKeywords: true }),
  ClickHouseDialect.language.data.of({ autocomplete: expressionCompletionSource }),
  autocompletion(),
  Prec.highest(keymap.of([...completionKeymap])),
];
