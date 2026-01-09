import { autocompletion, CompletionContext, completionKeymap, CompletionResult } from "@codemirror/autocomplete";
import { schemaCompletionSource, sql, SQLConfig, SQLNamespace } from "@codemirror/lang-sql";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { createTheme } from "@uiw/codemirror-themes";

import { ClickHouseDialect, clickhouseFunctions } from "@/components/ui/content-renderer/lang-clickhouse.ts";
import { defaultThemeSettings, githubDarkStyle } from "@/components/ui/content-renderer/utils";

const tableSchemas = {
  spans: [
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
    { name: "model", type: "String", description: "LLM model used. Is a coalesce of request_model and response_model" },
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
      type: "String",
      description: "Tags associated with the span as a stringified JSON array of strings",
    },
  ],
  traces: [
    // Core columns
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
  ],
  dataset_datapoints: [
    { name: "id", type: "UUID", description: "Unique identifier for the dataset datapoint" },
    { name: "created_at", type: "DateTime64(9, 'UTC')", description: "When the dataset datapoint was created" },
    { name: "dataset_id", type: "UUID", description: "Unique identifier for the dataset" },
    { name: "data", type: "String", description: "Input data for the dataset datapoint" },
    { name: "target", type: "String", description: "Target/expected output" },
    { name: "metadata", type: "String", description: "Additional metadata" },
  ],
  evaluation_datapoints: [
    { name: "id", type: "UUID", description: "Unique identifier for the evaluation datapoint" },
    { name: "evaluation_id", type: "UUID", description: "Unique identifier for the evaluation" },
    { name: "trace_id", type: "UUID", description: "Unique identifier for the trace" },
    { name: "created_at", type: "DateTime64(9, 'UTC')", description: "When the evaluation datapoint was created" },
    { name: "data", type: "String", description: "Input data for the evaluation datapoint" },
    { name: "target", type: "String", description: "Target/expected output" },
    { name: "metadata", type: "String", description: "Additional metadata as stringified JSON" },
    { name: "executor_output", type: "String", description: "Output from the executor as" },
    { name: "index", type: "Int64", description: "Index of the evaluation datapoint within the evaluation" },
    { name: "group_id", type: "String", description: "Group identifier of the evaluation run" },
    {
      name: "scores",
      type: "String",
      description: "Scores for the evaluation datapoint as a stringified JSON object from score name to value",
    },
  ],
  events: [
    { name: "id", type: "UUID", description: "Unique identifier for the event" },
    { name: "span_id", type: "UUID", description: "Identifier of the span that the event belongs to" },
    { name: "name", type: "String", description: "Name of the event" },
    { name: "timestamp", type: "DateTime64(9, 'UTC')", description: "When the event occurred" },
    { name: "attributes", type: "String", description: "Attributes of the event as stringified JSON" },
    { name: "trace_id", type: "UUID", description: "Identifier of the trace that the span with this event belongs to" },
    { name: "user_id", type: "String", description: "User ID associated with the event" },
    { name: "session_id", type: "String", description: "Session ID associated with the event" },
  ],
  tags: [
    { name: "id", type: "UUID", description: "Unique identifier for the tag" },
    { name: "span_id", type: "UUID", description: "Identifier of the span that the tag belongs to" },
    { name: "name", type: "String", description: "Name of the tag" },
    { name: "created_at", type: "DateTime64(9, 'UTC')", description: "When the tag was created" },
    { name: "source", type: "tag_source", description: "Source of the tag as a stringified enum value" },
  ],
};

const enumValues = {
  trace_type: ["DEFAULT", "EVALUATION", "PLAYGROUND"],
  span_type: ["DEFAULT", "LLM", "EXECUTOR", "EVALUATOR", "EVALUATION", "TOOL"],
  tag_source: ["HUMAN", "CODE"],
};

const sqlSchema: SQLNamespace = Object.fromEntries(
  Object.entries(tableSchemas).map(([tableName, columns]) => [
    tableName,
    columns.map((col) =>
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

const matchesSearch = (text: string, search: string): boolean => text.toLowerCase().includes(search);
const startsWithSearch = (text: string, search: string): boolean => text.toLowerCase().startsWith(search.toLowerCase());
const createOption = (label: string, type: string, info: string, apply?: string) => ({
  label,
  type,
  info,
  apply: apply || label,
});
const isInEnumContext = (textBefore: string): boolean =>
  /\b(span_type|trace_type|tag_source)\s*=\s*[^=\n]*$/.test(textBefore);
const getEnumType = (textBefore: string): string | null => {
  const match = textBefore.match(/\b(span_type|trace_type|tag_source)(?=\s*=)/);
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
  Object.values(clickhouseFunctions)
    .flat()
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

const generateAllColumnCompletions = (searchTerm: string) => {
  const columnMap = new Map<string, { tables: string[]; type: string; description: string }>();

  Object.entries(tableSchemas).forEach(([tableName, columns]) => {
    columns
      .filter((col) => col.name !== "*" && startsWithSearch(col.name, searchTerm))
      .forEach((col) => {
        if (!columnMap.has(col.name)) {
          columnMap.set(col.name, {
            tables: [tableName],
            type: col.type,
            description: col.description,
          });
        } else {
          // Column exists in multiple tables
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
      info: `Found in: ${tableList}\n${data.type} - ${data.description}`,
      boost: -1,
    });
  });

  return allColumns;
};

const generateCompletions = (textBefore: string, searchTerm: string) => {
  if (isInEnumContext(textBefore)) {
    const enumType = getEnumType(textBefore);
    if (enumType) {
      return generateEnumCompletions(enumType, searchTerm);
    }
  }

  return generateCustomCompletions(searchTerm);
};

const sqlConfig: SQLConfig = {
  dialect: ClickHouseDialect,
  schema: sqlSchema,
  upperCaseKeywords: true,
};

const sqlSchemaCompletions = schemaCompletionSource(sqlConfig);

const combinedCompletionSource = (
  context: CompletionContext
): CompletionResult | Promise<CompletionResult | null> | null => {
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) {
    return null;
  }

  const textBefore = context.state.doc.sliceString(0, context.pos);
  const searchTerm = word.text.toLowerCase();

  const sqlCompletions = sqlSchemaCompletions(context);

  const customOptions = generateCompletions(textBefore, searchTerm);
  const sortedCustomOptions = sortByRelevance(customOptions, searchTerm);

  const columnCompletions = generateAllColumnCompletions(searchTerm);

  if (sqlCompletions instanceof Promise) {
    return sqlCompletions.then((resolved) => {
      const allOptions = [...(resolved?.options || []), ...sortedCustomOptions.slice(0, 50), ...columnCompletions];

      if (allOptions.length > 0) {
        return {
          from: word.from,
          options: allOptions,
          validFor: resolved?.validFor,
        };
      }
      return null;
    });
  } else {
    const allOptions = [...(sqlCompletions?.options || []), ...sortedCustomOptions.slice(0, 50), ...columnCompletions];

    if (allOptions.length > 0) {
      return {
        from: word.from,
        options: allOptions,
        validFor: sqlCompletions?.validFor,
      };
    }
  }

  return null;
};

export const theme = createTheme({
  theme: "dark",
  settings: defaultThemeSettings,
  styles: githubDarkStyle,
});

export const extensions = [
  EditorView.theme({
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
  }),
  search(),
  highlightSelectionMatches(),
  EditorView.lineWrapping,
  sql({
    dialect: ClickHouseDialect,
    upperCaseKeywords: true,
  }),
  ClickHouseDialect.language.data.of({
    autocomplete: combinedCompletionSource,
  }),
  autocompletion(),
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
