import {
  autocompletion,
  type CompletionContext,
  completionKeymap,
  type CompletionResult,
} from "@codemirror/autocomplete";
import {
  keywordCompletionSource,
  schemaCompletionSource,
  sql,
  type SQLConfig,
  type SQLNamespace,
} from "@codemirror/lang-sql";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { Prec } from "@codemirror/state";
import { EditorView, keymap, tooltips } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { createTheme, type CreateThemeOptions } from "@uiw/codemirror-themes";

import {
  ClickHouseDialect,
  clickhouseFunctions,
  createIdentifierHighlighter,
  isInsideString,
  signatureHelp,
} from "@/components/ui/content-renderer/lang-clickhouse";
import { defaultThemeSettings } from "@/components/ui/content-renderer/utils";

// Finite-set values for String/UInt8 columns. Used by both the AI prompt
// builder and the editor autocomplete to constrain `<column> = ` literals.
export const enumValues = {
  span_type: ["DEFAULT", "LLM", "EXECUTOR", "EVALUATOR", "EVALUATION", "TOOL", "HUMAN_EVALUATOR", "CACHED", "UNKNOWN"],
  trace_type: ["DEFAULT", "EVALUATION", "PLAYGROUND"],
  status: ["success", "error"],
  signal_run_status: ["PENDING", "COMPLETED", "FAILED", "UNKNOWN"],
  signal_run_mode: ["BATCH", "REALTIME", "UNKNOWN"],
} as const satisfies Record<string, readonly string[]>;

export type EnumType = keyof typeof enumValues;

export interface ColumnSchema {
  name: string;
  type: string;
  description: string;
  // Names an entry in `enumValues` when `type` is `String`/`UInt8` but values are constrained.
  enumType?: EnumType;
}

export interface TableSchema {
  description: string;
  columns: ColumnSchema[];
}

export interface SQLSchemaConfig {
  tables?: string[];
  customTables?: Record<string, TableSchema>;
}

// Source of truth for the SQL editor schema (autocomplete + AI prompt schema text).
export const tableSchemas: Record<string, TableSchema> = {
  spans: {
    description: "Individual spans within traces, containing timing, tokens, costs, and LLM-specific data",
    columns: [
      { name: "span_id", type: "UUID", description: "Unique identifier for the span" },
      {
        name: "status",
        type: "String",
        enumType: "status",
        description: "Normalized status of the span. One of 'success' or 'error'",
      },
      { name: "name", type: "String", description: "Name of the span" },
      { name: "path", type: "String", description: "Hierarchical path of the span (e.g., 'outer.inner')" },
      { name: "parent_span_id", type: "UUID", description: "ID of the parent span" },
      {
        name: "span_type",
        type: "String",
        enumType: "span_type",
        description: "Stringified enum value of the span type",
      },
      { name: "start_time", type: "DateTime64(9, 'UTC')", description: "When the span started" },
      { name: "end_time", type: "DateTime64(9, 'UTC')", description: "When the span ended" },
      { name: "duration", type: "Float64", description: "Duration in seconds (end_time - start_time)" },
      { name: "input", type: "String", description: "Input data for the span as a stringified JSON" },
      { name: "output", type: "String", description: "Output data from the span as a stringified JSON" },
      { name: "request_model", type: "String", description: "LLM model specified in the request" },
      { name: "response_model", type: "String", description: "LLM model returned in the response" },
      {
        name: "model",
        type: "String",
        description: "LLM model used. Is a coalesce of request_model and response_model",
      },
      { name: "provider", type: "String", description: "LLM provider, e.g. openai, anthropic, etc." },
      { name: "input_tokens", type: "UInt64", description: "Number of input tokens" },
      { name: "output_tokens", type: "UInt64", description: "Number of output tokens" },
      { name: "total_tokens", type: "UInt64", description: "Total tokens used" },
      { name: "input_cost", type: "Float64", description: "Cost for input tokens" },
      { name: "output_cost", type: "Float64", description: "Cost for output tokens" },
      { name: "total_cost", type: "Float64", description: "Total cost of the span" },
      { name: "attributes", type: "String", description: "Span attributes as stringified JSON" },
      { name: "trace_id", type: "UUID", description: "ID of the trace" },
      {
        name: "tags",
        type: "Array(String)",
        description: "Tags associated with the span as an array of strings",
      },
      {
        name: "events",
        type: "Array(Tuple(timestamp Int64, name String, attributes String))",
        description: "Events associated with the span",
      },
      {
        name: "tool_definitions",
        type: "String",
        description: "Tool definitions available to the LLM span as stringified JSON",
      },
    ],
  },
  traces: {
    description: "Top-level trace records aggregating span data with session and user context",
    columns: [
      { name: "id", type: "UUID", description: "Unique identifier for the trace" },
      {
        name: "trace_type",
        type: "String",
        enumType: "trace_type",
        description: "Stringified enum value of the trace type",
      },
      { name: "metadata", type: "String", description: "Trace metadata as stringified JSON" },
      { name: "start_time", type: "DateTime64(9, 'UTC')", description: "When the trace started" },
      { name: "end_time", type: "DateTime64(9, 'UTC')", description: "When the trace ended" },
      { name: "duration", type: "Float64", description: "Duration in seconds (end_time - start_time)" },
      { name: "input_tokens", type: "Int64", description: "Number of input tokens" },
      { name: "output_tokens", type: "Int64", description: "Number of output tokens" },
      { name: "total_tokens", type: "Int64", description: "Total tokens used" },
      { name: "input_cost", type: "Float64", description: "Cost for input tokens" },
      { name: "output_cost", type: "Float64", description: "Cost for output tokens" },
      { name: "total_cost", type: "Float64", description: "Total cost of the span" },
      {
        name: "status",
        type: "String",
        enumType: "status",
        description:
          "Normalized status of the trace. 'error' if any span in the trace has status 'error', otherwise 'success'",
      },
      { name: "user_id", type: "String", description: "User ID sent with the trace" },
      { name: "session_id", type: "String", description: "Session identifier" },
      { name: "top_span_id", type: "UUID", description: "ID of the top-level span" },
      { name: "top_span_name", type: "String", description: "Name of the top-level span" },
      {
        name: "top_span_type",
        type: "String",
        enumType: "span_type",
        description: "Stringified enum value of the top-level span type",
      },
      {
        name: "tags",
        type: "Array(String)",
        description: "Union of all span-level tags from spans inside the trace",
      },
      {
        name: "trace_tags",
        type: "Array(String)",
        description: "Tags applied directly to the trace (independent of span-level tags)",
      },
      {
        name: "span_names",
        type: "Array(String)",
        description: "De-duplicated list of span names produced anywhere in the trace",
      },
      {
        name: "root_span_input",
        type: "String",
        description: "Input of the trace's top span as stringified JSON or raw string",
      },
      {
        name: "root_span_output",
        type: "String",
        description: "Output of the trace's top span as stringified JSON or raw string",
      },
      { name: "has_browser_session", type: "Bool", description: "Whether the trace has a browser session" },
    ],
  },
  dataset_datapoints: {
    description: "Data points in datasets with input data, targets, and metadata",
    columns: [
      { name: "id", type: "UUID", description: "Unique identifier for the dataset datapoint" },
      { name: "created_at", type: "DateTime64(9, 'UTC')", description: "When the dataset datapoint was created" },
      { name: "dataset_id", type: "UUID", description: "Unique identifier for the dataset" },
      { name: "data", type: "String", description: "Input data for the dataset datapoint" },
      { name: "target", type: "String", description: "Target/expected output" },
      { name: "metadata", type: "String", description: "Additional metadata" },
    ],
  },
  dataset_datapoint_versions: {
    description: "Versioned snapshots of dataset datapoints",
    columns: [
      { name: "id", type: "UUID", description: "Unique identifier for the dataset datapoint" },
      {
        name: "created_at",
        type: "DateTime64(9, 'UTC')",
        description: "When the dataset datapoint version was created",
      },
      { name: "dataset_id", type: "UUID", description: "Unique identifier for the dataset" },
      { name: "data", type: "String", description: "Input data for the dataset datapoint" },
      { name: "target", type: "String", description: "Target/expected output" },
      { name: "metadata", type: "String", description: "Additional metadata" },
    ],
  },
  evaluation_datapoints: {
    description: "Results from evaluations including scores, executor output, and trace data",
    columns: [
      { name: "id", type: "UUID", description: "Unique identifier for the evaluation datapoint" },
      { name: "evaluation_id", type: "UUID", description: "Unique identifier for the evaluation" },
      { name: "trace_id", type: "UUID", description: "Unique identifier for the trace" },
      { name: "created_at", type: "DateTime64(9, 'UTC')", description: "When the evaluation datapoint was created" },
      { name: "data", type: "String", description: "Input data for the evaluation datapoint" },
      { name: "target", type: "String", description: "Target/expected output" },
      { name: "metadata", type: "String", description: "Additional metadata as stringified JSON" },
      { name: "executor_output", type: "String", description: "Output from the executor" },
      { name: "index", type: "UInt64", description: "Index of the evaluation datapoint within the evaluation" },
      { name: "group_id", type: "String", description: "Group identifier of the evaluation run" },
      {
        name: "scores",
        type: "String",
        description: "Scores for the evaluation datapoint as a stringified JSON object from score name to value",
      },
      { name: "updated_at", type: "DateTime64(9, 'UTC')", description: "When the datapoint was last updated" },
      {
        name: "dataset_id",
        type: "UUID",
        description: "Unique identifier for the dataset. Nil if the evaluation datapoint is not linked to a dataset",
      },
      {
        name: "dataset_datapoint_id",
        type: "UUID",
        description:
          "Unique identifier for the dataset datapoint. Nil if the evaluation datapoint is not linked to a dataset datapoint",
      },
      {
        name: "dataset_datapoint_created_at",
        type: "DateTime64(9, 'UTC')",
        description:
          "When the dataset datapoint was created. Unix epoch if the evaluation datapoint is not linked to a dataset datapoint",
      },
      { name: "duration", type: "Float64", description: "Duration in seconds from associated trace" },
      { name: "input_cost", type: "Float64", description: "Cost for input tokens from associated trace" },
      { name: "output_cost", type: "Float64", description: "Cost for output tokens from associated trace" },
      { name: "total_cost", type: "Float64", description: "Total cost from associated trace" },
      { name: "start_time", type: "DateTime64(9, 'UTC')", description: "When the trace started" },
      { name: "end_time", type: "DateTime64(9, 'UTC')", description: "When the trace ended" },
      { name: "input_tokens", type: "Int64", description: "Number of input tokens from associated trace" },
      { name: "output_tokens", type: "Int64", description: "Number of output tokens from associated trace" },
      { name: "total_tokens", type: "Int64", description: "Total tokens used from associated trace" },
      {
        name: "trace_status",
        type: "String",
        enumType: "status",
        description: "Status of the associated trace. One of 'success' or 'error'",
      },
      { name: "trace_metadata", type: "String", description: "Metadata from the associated trace as stringified JSON" },
      { name: "trace_tags", type: "Array(String)", description: "Tags from the associated trace" },
      { name: "top_span_id", type: "UUID", description: "ID of the top-level span of the associated trace" },
      {
        name: "trace_spans",
        type: "Array(Tuple(name String, duration Float64, type String))",
        description: "Spans from the associated trace",
      },
    ],
  },
  signal_runs: {
    description: "Execution records for signals with status and error information",
    columns: [
      { name: "signal_id", type: "UUID", description: "Unique identifier for the signal" },
      { name: "job_id", type: "UUID", description: "Unique identifier for the job" },
      { name: "trigger_id", type: "UUID", description: "Unique identifier for the trigger" },
      { name: "run_id", type: "UUID", description: "Unique identifier for the run" },
      { name: "trace_id", type: "UUID", description: "Unique identifier for the trace" },
      {
        name: "status",
        type: "String",
        enumType: "signal_run_status",
        description: "Status of the signal run",
      },
      {
        name: "mode",
        type: "String",
        enumType: "signal_run_mode",
        description: "Mode of the signal run. 'BATCH' for historical backfill, 'REALTIME' for live triggers",
      },
      { name: "event_id", type: "UUID", description: "Unique identifier for the event" },
      { name: "error_message", type: "String", description: "Error message if the run failed" },
      { name: "updated_at", type: "DateTime64(9, 'UTC')", description: "When the signal run was last updated" },
    ],
  },
  signal_events: {
    description: "Events emitted by signals during execution",
    columns: [
      { name: "id", type: "UUID", description: "Unique identifier for the signal event" },
      { name: "signal_id", type: "UUID", description: "Unique identifier for the signal" },
      { name: "trace_id", type: "UUID", description: "Unique identifier for the trace" },
      { name: "run_id", type: "UUID", description: "Unique identifier for the run" },
      { name: "name", type: "String", description: "Name of the signal event" },
      { name: "payload", type: "String", description: "Payload of the signal event as stringified JSON" },
      { name: "timestamp", type: "DateTime64(9, 'UTC')", description: "When the signal event occurred" },
      {
        name: "severity",
        type: "UInt8",
        description: "Numeric severity level. 0 = INFO, 1 = WARNING, 2 = CRITICAL",
      },
      {
        name: "summary",
        type: "String",
        description: "Short, human-readable description of the event. May be empty for older events",
      },
      {
        name: "clusters",
        type: "Array(UUID)",
        description: "Cluster IDs this event belongs to. Excludes L0 clusters",
      },
    ],
  },
  clusters: {
    description: "Clusters of similar signal events, grouped into a hierarchy. Excludes L0 clusters",
    columns: [
      { name: "id", type: "UUID", description: "Unique identifier for the cluster" },
      { name: "signal_id", type: "UUID", description: "Unique identifier for the signal the cluster belongs to" },
      { name: "name", type: "String", description: "Human-readable name of the cluster" },
      {
        name: "level",
        type: "UInt8",
        description: "Level of the cluster in the hierarchy. Higher levels are coarser groupings",
      },
      { name: "parent_id", type: "UUID", description: "ID of the parent cluster. Nil UUID for top-level clusters" },
      { name: "num_signal_events", type: "UInt32", description: "Number of signal events in the cluster" },
      { name: "num_children_clusters", type: "UInt16", description: "Number of immediate child clusters" },
      { name: "created_at", type: "DateTime64(9, 'UTC')", description: "When the cluster was created" },
      { name: "updated_at", type: "DateTime64(9, 'UTC')", description: "When the cluster was last updated" },
    ],
  },
  logs: {
    description: "Log entries with severity, body, and trace correlation",
    columns: [
      { name: "log_id", type: "UUID", description: "Unique identifier for the log" },
      { name: "time", type: "DateTime64(9, 'UTC')", description: "When the log occurred" },
      { name: "observed_time", type: "DateTime64(9, 'UTC')", description: "When the log was observed" },
      { name: "severity_number", type: "UInt8", description: "Severity number of the log" },
      { name: "severity_text", type: "String", description: "Severity text of the log" },
      { name: "body", type: "String", description: "Body of the log" },
      { name: "attributes", type: "String", description: "Attributes of the log as stringified JSON" },
      { name: "trace_id", type: "UUID", description: "Unique identifier for the trace" },
      { name: "span_id", type: "UUID", description: "Unique identifier for the span" },
      { name: "flags", type: "UInt32", description: "Flags for the log" },
      { name: "event_name", type: "String", description: "Event name of the log" },
    ],
  },
};

// --- String / option helpers -------------------------------------------------
const matchesSearch = (text: string, search: string) => text.toLowerCase().includes(search);
const startsWithSearch = (text: string, search: string) => text.toLowerCase().startsWith(search.toLowerCase());
const createOption = (label: string, type: string, info: string, apply?: string) => ({
  label,
  type,
  info,
  apply: apply ?? label,
});

// --- Enum metadata derived from tableSchemas ---------------------------------
// columnName (lc) -> enums it can be (`status` is both `status` and `signal_run_status`).
const columnEnumMap = new Map<string, Set<EnumType>>();
// enumName -> `table.column` sources, used for info tooltips.
const enumUsageMap = new Map<EnumType, string[]>();
const allEnumTypes: EnumType[] = [];
Object.entries(tableSchemas).forEach(([table, { columns }]) => {
  columns.forEach((col) => {
    if (!col.enumType) return;
    const key = col.name.toLowerCase();
    if (!columnEnumMap.has(key)) columnEnumMap.set(key, new Set());
    columnEnumMap.get(key)!.add(col.enumType);
    if (!enumUsageMap.has(col.enumType)) {
      enumUsageMap.set(col.enumType, []);
      allEnumTypes.push(col.enumType);
    }
    enumUsageMap.get(col.enumType)!.push(`${table}.${col.name}`);
  });
});

const enumValuesList = (et: EnumType) => enumValues[et].map((v) => `'${v}'`).join(", ");
const enumInfo = (et: EnumType) => `${et} enum — used in ${(enumUsageMap.get(et) ?? []).join(", ") || et}`;

// Detail / info for a single column (table-scoped path).
const columnDetail = (col: ColumnSchema) => col.enumType ?? col.type;
const columnInfo = (col: ColumnSchema) =>
  col.enumType ? `${col.description}\nAllowed values: ${enumValuesList(col.enumType)}` : col.description;

// --- Enum context detection: `<enum_col> = …` anchored to cursor -------------
// Anchored to `$` so `WHERE status = 'x' AND mode = '` resolves to `mode`.
const enumColumnNamesPattern = Array.from(columnEnumMap.keys())
  .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const enumContextRegex = new RegExp(`\\b(${enumColumnNamesPattern})\\s*=\\s*[^=\\n]*$`, "i");
const matchEnumColumn = (textBefore: string): string | null =>
  textBefore.match(enumContextRegex)?.[1]?.toLowerCase() ?? null;

// Build enum-value options for one or more enum types, deduped by value.
const buildEnumOptions = (enumTypes: Iterable<EnumType>, partial: string, apply: (value: string) => string) => {
  const seen = new Set<string>();
  const options: ReturnType<typeof createOption>[] = [];
  for (const et of enumTypes) {
    for (const value of enumValues[et]) {
      if (seen.has(value) || !matchesSearch(value, partial)) continue;
      seen.add(value);
      options.push(createOption(value, "enum", enumInfo(et), apply(value)));
    }
  }
  return options;
};

// --- Misc completion sources --------------------------------------------------
const clickhouseFunctionCompletions = (searchTerm: string) =>
  clickhouseFunctions
    .filter((fn) => matchesSearch(fn.name, searchTerm))
    .map((fn) => createOption(fn.name, "function", `ClickHouse function: ${fn.description}`));

const customCompletions = (textBefore: string, searchTerm: string) => {
  const enumColumn = matchEnumColumn(textBefore);
  if (enumColumn) {
    const enumTypes = columnEnumMap.get(enumColumn);
    if (enumTypes) return buildEnumOptions(enumTypes, searchTerm, (v) => `'${v}'`);
  }
  return [...buildEnumOptions(allEnumTypes, searchTerm, (v) => `'${v}'`), ...clickhouseFunctionCompletions(searchTerm)];
};

// --- Sorting -----------------------------------------------------------------
const relevanceScore = (label: string, search: string) => {
  const a = label.toLowerCase();
  const b = search.toLowerCase();
  if (a === b) return 0;
  if (a.startsWith(b)) return 1;
  return 2;
};
const sortByRelevance = (options: any[], searchTerm: string) =>
  options.sort(
    (a, b) =>
      relevanceScore(a.label, searchTerm) - relevanceScore(b.label, searchTerm) || a.label.localeCompare(b.label)
  );

// Filters default tables to `config.tables` (if set) and merges `customTables`.
export function resolveTableSchemas(config?: SQLSchemaConfig): Record<string, TableSchema> {
  const base = config?.tables
    ? Object.fromEntries(config.tables.filter((t) => t in tableSchemas).map((t) => [t, tableSchemas[t]]))
    : { ...tableSchemas };
  return config?.customTables ? { ...base, ...config.customTables } : base;
}

function createScopedCompletionSource(scopedSchemas: Record<string, TableSchema>, knownIds: Set<string>) {
  const sqlSchema: SQLNamespace = Object.fromEntries(
    Object.entries(scopedSchemas).map(([tableName, tableData]) => [
      tableName,
      tableData.columns.map((col) =>
        col.name !== "*"
          ? {
              label: col.name,
              type: "property",
              detail: columnDetail(col),
              info: columnInfo(col),
            }
          : col.name
      ),
    ])
  );

  const sqlConfig: SQLConfig = {
    dialect: ClickHouseDialect,
    schema: sqlSchema,
    upperCaseKeywords: true,
  };

  const sqlSchemaCompletions = schemaCompletionSource(sqlConfig);
  const sqlKeywordCompletions = keywordCompletionSource(ClickHouseDialect, true);

  const generateTableCompletions = (searchTerm: string) =>
    Object.entries(scopedSchemas)
      .filter(([tableName]) => startsWithSearch(tableName, searchTerm))
      .map(([tableName, tableData]) => ({
        label: tableName,
        type: "type",
        detail: "table",
        info: tableData.description,
        boost: 2,
      }));

  // Cross-table column completions. Renders per-enum breakdown when the same
  // column name (e.g. `status`) carries different enums across tables.
  const generateAllColumnCompletions = (searchTerm: string) => {
    const grouped = new Map<string, Array<{ table: string; col: ColumnSchema }>>();
    Object.entries(scopedSchemas).forEach(([table, { columns }]) => {
      columns
        .filter((col) => col.name !== "*" && startsWithSearch(col.name, searchTerm))
        .forEach((col) => {
          const arr = grouped.get(col.name) ?? [];
          arr.push({ table, col });
          grouped.set(col.name, arr);
        });
    });

    return Array.from(grouped.entries()).map(([name, entries]) => {
      const tables = Array.from(new Set(entries.map((e) => e.table))).join(", ");
      const enums = new Map<EnumType, string[]>();
      const plain: string[] = [];
      entries.forEach(({ table, col }) => {
        const src = `${table}.${col.name}`;
        if (!col.enumType) plain.push(src);
        else {
          if (!enums.has(col.enumType)) enums.set(col.enumType, []);
          enums.get(col.enumType)!.push(src);
        }
      });

      const rep = entries[0].col;
      let detail = rep.type;
      let info = `Found in: ${tables}\n${rep.description}`;
      if (enums.size === 1) {
        const [et] = enums.keys();
        detail = et;
        info = `Found in: ${tables}\n${columnInfo(rep)}`;
      } else if (enums.size > 1) {
        const lines = Array.from(enums.entries()).map(([et, srcs]) => `  ${srcs.join(", ")}: ${enumValuesList(et)}`);
        if (plain.length > 0) lines.push(`  ${plain.join(", ")}: unconstrained`);
        info = `Found in: ${tables}\nAllowed values vary by table:\n${lines.join("\n")}`;
      }

      return { label: name, type: "property", detail, info, boost: -1 };
    });
  };

  return (context: CompletionContext): CompletionResult | Promise<CompletionResult | null> | null => {
    const textBefore = context.state.doc.sliceString(0, context.pos);

    // Inside `'…'`: only enum values for `<enum_col> = '<cursor>`. Append the
    // closing `'` ourselves unless one is already there; bail on mid-word
    // cursor (`'PEN|DING'`) so we don't splice into an existing word.
    if (isInsideString(context.state, context.pos)) {
      const enumColumn = matchEnumColumn(textBefore);
      const enumTypes = enumColumn ? columnEnumMap.get(enumColumn) : null;
      if (!enumTypes) return null;
      const nextChar = context.state.doc.sliceString(context.pos, context.pos + 1);
      if (/\w/.test(nextChar)) return null;
      const partial = context.matchBefore(/\w*/);
      const partialText = (partial?.text ?? "").toLowerCase();
      const suffix = nextChar === "'" ? "" : "'";
      const options = buildEnumOptions(enumTypes, partialText, (v) => `${v}${suffix}`);
      if (options.length === 0) return null;
      return {
        from: partial?.from ?? context.pos,
        options: sortByRelevance(options, partialText),
        validFor: /^\w*$/,
      };
    }

    const word = context.matchBefore(/\w*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const searchTerm = word.text.toLowerCase();

    const sqlCompletions = sqlSchemaCompletions(context);
    const keywordCompletions = sqlKeywordCompletions(context);
    const tableCompletions = generateTableCompletions(searchTerm);
    const columnCompletions = generateAllColumnCompletions(searchTerm);
    const sortedCustom = sortByRelevance(customCompletions(textBefore, searchTerm), searchTerm);

    // Strip table/column entries from the SQL-package completions; we already
    // emit our own richer versions above.
    const filterSchemaCompletions = (opts: readonly { label?: string }[]) =>
      opts.filter((opt) => {
        const label = opt.label?.toLowerCase() ?? "";
        return !(label in scopedSchemas) && !knownIds.has(label);
      });

    const buildResult = (
      schemaOpts: readonly { label?: string }[] | null,
      keywordOpts: readonly { label?: string }[] | null,
      validFor?: CompletionResult["validFor"]
    ): CompletionResult | null => {
      const allOptions = [
        ...tableCompletions,
        ...columnCompletions,
        ...sortedCustom.slice(0, 50),
        ...(keywordOpts ?? []),
        ...filterSchemaCompletions(schemaOpts ?? []),
      ];
      return allOptions.length > 0 ? { from: word.from, options: allOptions, validFor } : null;
    };

    const needsAwait = sqlCompletions instanceof Promise || keywordCompletions instanceof Promise;
    if (needsAwait) {
      return Promise.all([Promise.resolve(sqlCompletions), Promise.resolve(keywordCompletions)]).then(
        ([schema, keywords]) => buildResult(schema?.options ?? null, keywords?.options ?? null, schema?.validFor)
      );
    }
    return buildResult(sqlCompletions?.options ?? null, keywordCompletions?.options ?? null, sqlCompletions?.validFor);
  };
}

function computeKnownIdentifiers(schemas: Record<string, TableSchema>): Set<string> {
  const identifiers = new Set<string>();
  Object.entries(schemas).forEach(([tableName, { columns }]) => {
    identifiers.add(tableName.toLowerCase());
    columns.forEach((col) => identifiers.add(col.name.toLowerCase()));
  });
  return identifiers;
}

const sqlSyntaxHighlightStyle: CreateThemeOptions["styles"] = [
  // Keywords (SELECT, FROM, WHERE, etc.)
  { tag: t.keyword, color: "#C586C0" },

  // Strings
  { tag: t.string, color: "#CE9178" },
  { tag: t.special(t.string), color: "#CE9178" },

  // Numbers
  { tag: t.number, color: "#B5CEA8" },
  { tag: t.integer, color: "#B5CEA8" },
  { tag: t.float, color: "#B5CEA8" },

  // Comments
  { tag: t.comment, color: "#6A9955" },
  { tag: t.lineComment, color: "#6A9955" },
  { tag: t.blockComment, color: "#6A9955" },

  // Operators and punctuation
  { tag: t.operator, color: "#D4D4D4" },
  { tag: t.punctuation, color: "#D4D4D4" },
  { tag: t.separator, color: "#D4D4D4" },
  { tag: t.bracket, color: "#D4D4D4" },
  { tag: t.paren, color: "#D4D4D4" },

  // Types
  { tag: t.typeName, color: "#4EC9B0" },
  { tag: t.className, color: "#4EC9B0" },

  // Special values
  { tag: t.bool, color: "#569CD6" },
  { tag: t.null, color: "#569CD6" },
  { tag: t.self, color: "#569CD6" },
];

export const theme = createTheme({
  theme: "dark",
  settings: defaultThemeSettings,
  styles: sqlSyntaxHighlightStyle,
});

// Editor base styles
const editorBaseStyles = {
  "&.cm-focused": {
    outline: "none !important",
  },
  "&": {
    fontSize: "0.875rem !important",
  },
  "&.cm-editor": {
    height: "100%",
    width: "100%",
    position: "relative",
  },
  ".cm-searchMatch": {
    backgroundColor: "hsl(var(--primary) / 0.3)",
    border: "1px solid hsl(var(--primary))",
    borderRadius: "3px",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "hsl(var(--primary))",
    color: "hsl(var(--primary-foreground))",
    fontWeight: "600",
  },
};

// Syntax highlighting styles for SQL identifiers
const syntaxHighlightStyles = {
  ".cm-content .cm-sql-function": {
    color: "#DCDCAA",
  },
  ".cm-line .cm-sql-function": {
    color: "#DCDCAA",
  },
  ".cm-content .cm-sql-known-identifier": {
    color: "#9CDCFE",
  },
  ".cm-line .cm-sql-known-identifier": {
    color: "#9CDCFE",
  },
  ".cm-content .cm-sql-unknown-identifier": {
    color: "#D4D4D4",
  },
  ".cm-line .cm-sql-unknown-identifier": {
    color: "#D4D4D4",
  },
};

// Autocomplete dropdown styles
const autocompleteStyles = {
  ".cm-tooltip.cm-tooltip-autocomplete": {
    background: "hsl(var(--background))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "6px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    // Note: don't use overflow:hidden here as it clips the info panel
  },
  ".cm-tooltip-autocomplete ul": {
    fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
    fontSize: "13px",
  },
  ".cm-tooltip-autocomplete ul li": {
    padding: "2px 6px !important",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    background: "hsl(var(--accent))",
    color: "hsl(var(--accent-foreground))",
  },
  ".cm-completionIcon": {
    width: "14px",
    height: "14px",
    padding: "0 !important",
    marginRight: "2px",
    opacity: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ".cm-completionIcon-function": {
    color: "#DCDCAA",
  },
  ".cm-completionIcon-function::after": {
    content: "'ƒ'",
    fontWeight: "600",
    fontSize: "13px",
  },
  ".cm-completionIcon-property": {
    color: "#9CDCFE",
  },
  ".cm-completionIcon-property::after": {
    content: "'◇'",
    fontSize: "11px",
  },
  ".cm-completionIcon-keyword": {
    color: "#C586C0",
  },
  ".cm-completionIcon-keyword::after": {
    content: "'⊞'",
    fontSize: "11px",
  },
  ".cm-completionIcon-enum": {
    color: "#4EC9B0",
  },
  ".cm-completionIcon-enum::after": {
    content: "'◆'",
    fontSize: "11px",
  },
  ".cm-completionIcon-type": {
    color: "#4EC9B0",
  },
  ".cm-completionIcon-type::after": {
    content: "'T'",
    fontWeight: "600",
    fontSize: "11px",
  },
  ".cm-completionLabel": {
    color: "hsl(var(--foreground))",
  },
  ".cm-completionMatchedText": {
    color: "hsl(var(--primary))",
    fontWeight: "600",
    textDecoration: "none",
  },
  ".cm-completionDetail": {
    color: "hsl(var(--muted-foreground))",
    fontStyle: "normal",
    marginLeft: "auto",
    fontSize: "11px",
  },
  ".cm-tooltip.cm-completionInfo": {
    background: "hsl(var(--background))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "6px",
    padding: "6px 10px",
    maxWidth: "400px",
    fontSize: "12px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "hsl(var(--muted-foreground))",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    whiteSpace: "pre-wrap",
    lineHeight: "1.4",
  },
};

// Signature help tooltip styles
const signatureHelpStyles = {
  ".cm-tooltip .signature-help": {
    padding: "6px 10px",
    background: "hsl(var(--background))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "6px",
    fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
    fontSize: "13px",
    maxWidth: "600px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
  },
  ".signature-help": {
    padding: "6px 10px !important",
    background: "hsl(var(--background))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "6px",
    fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
    fontSize: "13px",
    maxWidth: "600px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
  },
  ".signature-help .signature-function-name": {
    color: "hsl(var(--primary))",
    fontWeight: "600",
  },
  ".signature-help .signature-param": {
    color: "hsl(var(--foreground))",
  },
  ".signature-help .signature-param-current": {
    color: "hsl(var(--primary))",
    fontWeight: "700",
    background: "hsl(var(--primary) / 0.1)",
    padding: "1px 3px",
    borderRadius: "3px",
  },
  ".signature-help .signature-return-type": {
    color: "hsl(var(--muted-foreground))",
    fontSize: "12px",
    marginLeft: "6px",
  },
  ".signature-help .signature-description": {
    marginTop: "6px",
    paddingTop: "6px",
    borderTop: "1px solid hsl(var(--border))",
    color: "hsl(var(--muted-foreground))",
    fontSize: "12px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  ".signature-help .signature-param-details": {
    marginTop: "6px",
    paddingTop: "6px",
    borderTop: "1px solid hsl(var(--border))",
    fontSize: "12px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  ".signature-help .signature-param-type": {
    color: "hsl(var(--muted-foreground))",
    fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', monospace",
    marginLeft: "4px",
  },
  ".signature-help .signature-param-details div": {
    marginTop: "3px",
    color: "hsl(var(--muted-foreground))",
  },
};

// Combined editor theme
export const editorTheme = EditorView.theme({
  ...editorBaseStyles,
  ...syntaxHighlightStyles,
  ...autocompleteStyles,
  ...signatureHelpStyles,
});

// CodeMirror extension bundle for the SQL editor, optionally scoped by `config`.
export function createExtensions(config?: SQLSchemaConfig) {
  const scopedSchemas = resolveTableSchemas(config);
  const knownIdentifiers = computeKnownIdentifiers(scopedSchemas);
  const identifierHighlighter = createIdentifierHighlighter(knownIdentifiers);
  const completionSource = createScopedCompletionSource(scopedSchemas, knownIdentifiers);

  return [
    editorTheme,
    tooltips({
      parent: typeof document !== "undefined" ? document.body : undefined,
    }),
    search(),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    sql({
      dialect: ClickHouseDialect,
      upperCaseKeywords: true,
    }),
    Prec.highest(identifierHighlighter),
    autocompletion({
      override: [completionSource],
    }),
    ...signatureHelp,
    Prec.highest(
      keymap.of([
        ...completionKeymap,
        {
          key: "Mod-Enter",
          run: () => true,
        },
      ])
    ),
  ];
}
