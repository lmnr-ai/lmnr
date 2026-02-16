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
import { syntaxTree } from "@codemirror/language";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { createTheme, type CreateThemeOptions } from "@uiw/codemirror-themes";

import {
  ClickHouseDialect,
  clickhouseFunctions,
  createIdentifierHighlighter,
  signatureHelp,
} from "@/components/ui/content-renderer/lang-clickhouse.ts";
import { defaultThemeSettings } from "@/components/ui/content-renderer/utils";

// Types for schema configuration
export interface ColumnSchema {
  name: string;
  type: string;
  description: string;
}

export interface TableSchema {
  description: string;
  columns: ColumnSchema[];
}

export interface SQLSchemaConfig {
  // Tables to include in autocomplete/validation
  // If undefined, all tables are available
  tables?: string[];
  // Custom table schemas (for dynamic/custom tables)
  customTables?: Record<string, TableSchema>;
}

// Table schemas with descriptions - single source of truth for table metadata
export const tableSchemas: Record<string, TableSchema> = {
  spans: {
    description: "Individual spans within traces, containing timing, tokens, costs, and LLM-specific data",
    columns: [
      { name: "span_id", type: "UUID", description: "Unique identifier for the span" },
      { name: "status", type: "String", description: "Status of the span" },
      { name: "name", type: "String", description: "Name of the span" },
      { name: "path", type: "String", description: "Hierarchical path of the span (e.g., 'outer.inner')" },
      { name: "parent_span_id", type: "UUID", description: "ID of the parent span" },
      {
        name: "span_type",
        type: "span_type",
        description: "Stringified enum value of the span type (DEFAULT, LLM, EXECUTOR, EVALUATOR, EVALUATION, TOOL)",
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
    ],
  },
  traces: {
    description: "Top-level trace records aggregating span data with session and user context",
    columns: [
      { name: "id", type: "UUID", description: "Unique identifier for the trace" },
      {
        name: "trace_type",
        type: "trace_type",
        description: "Stringified enum value of the trace type (DEFAULT, EVALUATION, PLAYGROUND)",
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
      { name: "status", type: "String", description: "Status of the trace" },
      { name: "user_id", type: "String", description: "User ID sent with the trace" },
      { name: "session_id", type: "String", description: "Session identifier" },
      { name: "top_span_id", type: "UUID", description: "ID of the top-level span" },
      { name: "top_span_name", type: "String", description: "Name of the top-level span" },
      { name: "top_span_type", type: "span_type", description: "Type of the top-level span" },
      { name: "tags", type: "Array(String)", description: "Tags associated with the trace" },
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
      { name: "trace_status", type: "String", description: "Status of the associated trace" },
      { name: "trace_metadata", type: "String", description: "Metadata from the associated trace as stringified JSON" },
      { name: "trace_tags", type: "Array(String)", description: "Tags from the associated trace" },
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
      { name: "status", type: "String", description: "Status of the signal run (PENDING, COMPLETED, FAILED, UNKNOWN)" },
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

export const enumValues: Record<string, string[]> = {
  trace_type: ["DEFAULT", "EVALUATION", "PLAYGROUND"],
  span_type: ["DEFAULT", "LLM", "EXECUTOR", "EVALUATOR", "EVALUATION", "TOOL"],
};

// Helper functions for completion
const matchesSearch = (text: string, search: string): boolean => text.toLowerCase().includes(search);
const startsWithSearch = (text: string, search: string): boolean => text.toLowerCase().startsWith(search.toLowerCase());
const createOption = (label: string, type: string, info: string, apply?: string) => ({
  label,
  type,
  info,
  apply: apply || label,
});
const isInEnumContext = (textBefore: string): boolean => /\b(span_type|trace_type)\s*=\s*[^=\n]*$/.test(textBefore);
const getEnumType = (textBefore: string): string | null => {
  const match = textBefore.match(/\b(span_type|trace_type)(?=\s*=)/);
  return match ? match[1] : null;
};

const generateEnumCompletions = (enumType: string, partialValue: string) => {
  const values = enumValues[enumType as keyof typeof enumValues];
  if (!values) return [];

  return values
    .filter((value) => matchesSearch(value, partialValue))
    .map((value) => createOption(value, "enum", `${enumType} enum value`, `'${value}'`));
};

const generateEnumValueCompletions = (searchTerm: string) =>
  Object.entries(enumValues).flatMap(([enumType, values]) =>
    values
      .filter((value) => matchesSearch(value, searchTerm))
      .map((value) => createOption(value, "enum", `${enumType} enum value`, `'${value}'`))
  );

const generateClickhouseFunctionCompletions = (searchTerm: string) =>
  clickhouseFunctions
    .filter((fn) => matchesSearch(fn.name, searchTerm))
    .map((fn) => createOption(fn.name, "function", `ClickHouse function: ${fn.description}`));

const generateCustomCompletions = (searchTerm: string) => [
  ...generateEnumValueCompletions(searchTerm),
  ...generateClickhouseFunctionCompletions(searchTerm),
];

const getRelevanceScore = (label: string, searchTerm: string): number => {
  const lowerLabel = label.toLowerCase();
  const lowerSearch = searchTerm.toLowerCase();

  if (lowerLabel === lowerSearch) return 0;
  if (lowerLabel.startsWith(lowerSearch)) return 1;
  return 2;
};

const sortByRelevance = (options: any[], searchTerm: string) =>
  options.sort((a, b) => {
    const scoreA = getRelevanceScore(a.label, searchTerm);
    const scoreB = getRelevanceScore(b.label, searchTerm);

    if (scoreA !== scoreB) return scoreA - scoreB;
    return a.label.localeCompare(b.label);
  });

const generateCompletions = (textBefore: string, searchTerm: string) => {
  if (isInEnumContext(textBefore)) {
    const enumType = getEnumType(textBefore);
    if (enumType) {
      return generateEnumCompletions(enumType, searchTerm);
    }
  }

  return generateCustomCompletions(searchTerm);
};

/**
 * Checks if the position is inside a string literal
 */
function isInsideString(context: CompletionContext): boolean {
  const tree = syntaxTree(context.state);
  const node = tree.resolveInner(context.pos, -1);
  return node.name === "String" || node.name === "QuotedString" || node.name === "Literal";
}

/**
 * Resolves the effective table schemas based on the schema config.
 * If no config is provided, returns all default table schemas.
 * If tables filter is provided, only includes those tables.
 * Custom tables are merged in addition to filtered default tables.
 */
export function resolveTableSchemas(config?: SQLSchemaConfig): Record<string, TableSchema> {
  let effectiveSchemas: Record<string, TableSchema> = {};

  if (config?.tables) {
    // Filter to only specified tables
    for (const tableName of config.tables) {
      if (tableSchemas[tableName]) {
        effectiveSchemas[tableName] = tableSchemas[tableName];
      }
    }
  } else {
    // Use all default tables
    effectiveSchemas = { ...tableSchemas };
  }

  // Merge custom tables
  if (config?.customTables) {
    effectiveSchemas = { ...effectiveSchemas, ...config.customTables };
  }

  return effectiveSchemas;
}

/**
 * Creates a completion source function scoped to the given table schemas
 */
function createScopedCompletionSource(scopedSchemas: Record<string, TableSchema>, knownIds: Set<string>) {
  const sqlSchema: SQLNamespace = Object.fromEntries(
    Object.entries(scopedSchemas).map(([tableName, tableData]) => [
      tableName,
      tableData.columns.map((col) =>
        col.name !== "*"
          ? {
              label: col.name,
              type: "property",
              detail: col.type,
              info: col.description,
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

  const generateAllColumnCompletions = (searchTerm: string) => {
    const columnMap = new Map<string, { tables: string[]; type: string; description: string }>();

    Object.entries(scopedSchemas).forEach(([tableName, tableData]) => {
      tableData.columns
        .filter((col) => col.name !== "*" && startsWithSearch(col.name, searchTerm))
        .forEach((col) => {
          if (!columnMap.has(col.name)) {
            columnMap.set(col.name, {
              tables: [tableName],
              type: col.type,
              description: col.description,
            });
          } else {
            const existing = columnMap.get(col.name)!;
            if (!existing.tables.includes(tableName)) {
              existing.tables.push(tableName);
            }
          }
        });
    });

    const allColumns: any[] = [];
    columnMap.forEach((data, columnName) => {
      const tableList = data.tables.join(", ");
      allColumns.push({
        label: columnName,
        type: "property",
        detail: data.type,
        info: `Found in: ${tableList}\n${data.description}`,
        boost: -1,
      });
    });

    return allColumns;
  };

  return (context: CompletionContext): CompletionResult | Promise<CompletionResult | null> | null => {
    if (isInsideString(context)) {
      return null;
    }

    const word = context.matchBefore(/\w*/);
    if (!word || (word.from === word.to && !context.explicit)) {
      return null;
    }

    const textBefore = context.state.doc.sliceString(0, context.pos);
    const searchTerm = word.text.toLowerCase();

    const sqlCompletions = sqlSchemaCompletions(context);
    const keywordCompletions = sqlKeywordCompletions(context);

    const customOptions = generateCompletions(textBefore, searchTerm);
    const sortedCustomOptions = sortByRelevance(customOptions, searchTerm);

    const tableCompletions = generateTableCompletions(searchTerm);
    const columnCompletions = generateAllColumnCompletions(searchTerm);

    const filterSchemaCompletions = (options: readonly { label?: string }[]) =>
      options.filter((opt) => {
        const label = opt.label?.toLowerCase();
        return !Object.keys(scopedSchemas).includes(label ?? "") && !knownIds.has(label ?? "");
      });

    const buildResult = (
      schemaOpts: readonly { label?: string }[] | null,
      keywordOpts: readonly { label?: string }[] | null,
      validFor?: CompletionResult["validFor"]
    ): CompletionResult | null => {
      const filteredSchema = filterSchemaCompletions(schemaOpts || []);
      const allOptions = [
        ...tableCompletions,
        ...columnCompletions,
        ...sortedCustomOptions.slice(0, 50),
        ...(keywordOpts || []),
        ...filteredSchema,
      ];

      if (allOptions.length > 0) {
        return {
          from: word.from,
          options: allOptions,
          validFor,
        };
      }
      return null;
    };

    const schemaIsPromise = sqlCompletions instanceof Promise;
    const keywordsIsPromise = keywordCompletions instanceof Promise;

    if (schemaIsPromise || keywordsIsPromise) {
      return Promise.all([
        schemaIsPromise ? sqlCompletions : Promise.resolve(sqlCompletions),
        keywordsIsPromise ? keywordCompletions : Promise.resolve(keywordCompletions),
      ]).then(([schemaResolved, keywordsResolved]) =>
        buildResult(schemaResolved?.options || null, keywordsResolved?.options || null, schemaResolved?.validFor)
      );
    } else {
      return buildResult(
        sqlCompletions?.options || null,
        keywordCompletions?.options || null,
        sqlCompletions?.validFor
      );
    }
  };
}

/**
 * Computes the set of known identifiers (table names and column names) from schemas
 */
function computeKnownIdentifiers(schemas: Record<string, TableSchema>): Set<string> {
  const identifiers = new Set<string>();
  Object.entries(schemas).forEach(([tableName, tableData]) => {
    identifiers.add(tableName.toLowerCase());
    tableData.columns.forEach((col) => {
      identifiers.add(col.name.toLowerCase());
    });
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

/**
 * Creates CodeMirror extensions for the SQL editor with optional scoped schema configuration.
 * @param config - Optional schema configuration to scope autocomplete to specific tables
 * @returns Array of CodeMirror extensions
 */
export function createExtensions(config?: SQLSchemaConfig) {
  const scopedSchemas = resolveTableSchemas(config);
  const knownIdentifiers = computeKnownIdentifiers(scopedSchemas);
  const identifierHighlighter = createIdentifierHighlighter(knownIdentifiers);
  const completionSource = createScopedCompletionSource(scopedSchemas, knownIdentifiers);

  return [
    editorTheme,
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

export const extensions = createExtensions();
