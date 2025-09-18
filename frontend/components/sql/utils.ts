import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { sql } from "@codemirror/lang-sql";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { createTheme } from "@uiw/codemirror-themes";

import { baseExtensions, defaultThemeSettings, githubDarkStyle } from "@/components/ui/code-highlighter/utils";

const tableSchemas = {
  spans: [
    { name: "span_id", type: "uuid", description: "Unique identifier for the span" },
    { name: "status", type: "text", description: "Status of the span" },
    { name: "name", type: "text", description: "Name of the span" },
    { name: "path", type: "text", description: "Hierarchical path of the span (e.g., 'outer.inner')" },
    { name: "parent_span_id", type: "uuid", description: "ID of the parent span" },
    {
      name: "span_type",
      type: "span_type",
      description: "Stringified enum value of the span type (DEFAULT, LLM, EXECUTOR, EVALUATOR, EVALUATION, TOOL)",
    },
    { name: "start_time", type: "timestamp", description: "When the span started" },
    { name: "end_time", type: "timestamp", description: "When the span ended" },
    { name: "duration", type: "double precision", description: "Duration in seconds (end_time - start_time)" },
    { name: "input", type: "jsonb", description: "Input data for the span" },
    { name: "output", type: "jsonb", description: "Output data from the span" },
    { name: "request_model", type: "text", description: "LLM model specified in the request" },
    { name: "response_model", type: "text", description: "LLM model returned in the response" },
    { name: "model", type: "text", description: "LLM model used. Is a coalesce of request_model and response_model" },
    { name: "provider", type: "text", description: "LLM provider, e.g. openai, anthropic, etc." },
    { name: "input_tokens", type: "bigint", description: "Number of input tokens" },
    { name: "output_tokens", type: "bigint", description: "Number of output tokens" },
    { name: "total_tokens", type: "bigint", description: "Total tokens used" },
    { name: "input_cost", type: "double precision", description: "Cost for input tokens" },
    { name: "output_cost", type: "double precision", description: "Cost for output tokens" },
    { name: "total_cost", type: "double precision", description: "Total cost of the span" },
    { name: "attributes", type: "text", description: "Span attributes as stringified JSON" },
    { name: "trace_id", type: "uuid", description: "ID of the trace" },
    { name: "tags", type: "text", description: "Tags associated with the span as a stringified JSON array of strings" },
  ],
  traces: [
    // Core columns
    { name: "id", type: "uuid", description: "Unique identifier for the trace" },
    { name: "trace_type", type: "trace_type", description: "Stringified enum value of the trace type (DEFAULT, EVALUATION)" },
    { name: "metadata", type: "text", description: "Trace metadata as stringified JSON" },
    { name: "start_time", type: "timestamp", description: "When the trace started" },
    { name: "end_time", type: "timestamp", description: "When the trace ended" },
    { name: "duration", type: "double precision", description: "Duration in seconds (end_time - start_time)" },
    { name: "input_tokens", type: "bigint", description: "Number of input tokens" },
    { name: "output_tokens", type: "bigint", description: "Number of output tokens" },
    { name: "total_tokens", type: "bigint", description: "Total tokens used" },
    { name: "input_cost", type: "double precision", description: "Cost for input tokens" },
    { name: "output_cost", type: "double precision", description: "Cost for output tokens" },
    { name: "total_cost", type: "double precision", description: "Total LLM cost of the trace" },
    { name: "status", type: "text", description: "Status of the trace" },
    { name: "user_id", type: "text", description: "User ID sent with the trace" },
    { name: "session_id", type: "text", description: "Session identifier" },
    { name: "top_span_id", type: "uuid", description: "ID of the top-level span" },
  ],
  dataset_datapoints: [
    { name: "id", type: "uuid", description: "Unique identifier for the dataset datapoint" },
    { name: "created_at", type: "timestamp", description: "When the dataset datapoint was created" },
    { name: "dataset_id", type: "uuid", description: "Unique identifier for the dataset" },
    { name: "data", type: "jsonb", description: "Input data for the dataset datapoint" },
    { name: "target", type: "jsonb", description: "Target/expected output" },
    { name: "metadata", type: "jsonb", description: "Additional metadata" },
  ],
  evaluation_datapoints: [
    { name: "id", type: "uuid", description: "Unique identifier for the evaluation datapoint" },
    { name: "evaluation_id", type: "uuid", description: "Unique identifier for the evaluation" },
    { name: "trace_id", type: "uuid", description: "Unique identifier for the trace" },
    { name: "created_at", type: "timestamp", description: "When the evaluation datapoint was created" },
    { name: "data", type: "string", description: "Input data for the evaluation datapoint" },
    { name: "target", type: "string", description: "Target/expected output" },
    { name: "metadata", type: "string", description: "Additional metadata as stringified JSON" },
    { name: "executor_output", type: "string", description: "Output from the executor as" },
    { name: "index", type: "integer", description: "Index of the evaluation datapoint within the evaluation" },
    { name: "group_id", type: "text", description: "Group identifier of the evaluation run" },
    { name: "scores", type: "text", description: "Scores for the evaluation datapoint as a stringified JSON object from score name to value" },
    { name: "scores_map", type: "map", description: "Scores for the evaluation datapoint as a clickhouse map" },
  ],
  events: [
    { name: "id", type: "uuid", description: "Unique identifier for the event" },
    { name: "span_id", type: "uuid", description: "Identifier of the span that the event belongs to" },
    { name: "name", type: "text", description: "Name of the event" },
    { name: "timestamp", type: "timestamp", description: "When the event occurred" },
    { name: "attributes", type: "jsonb", description: "Attributes of the event as stringified JSON" },
    { name: "trace_id", type: "uuid", description: "Identifier of the trace that the span with this event belongs to" },
    { name: "user_id", type: "text", description: "User ID associated with the event" },
    { name: "session_id", type: "text", description: "Session ID associated with the event" },
  ],
  tags: [
    { name: "id", type: "uuid", description: "Unique identifier for the tag" },
    { name: "span_id", type: "uuid", description: "Identifier of the span that the tag belongs to" },
    { name: "name", type: "text", description: "Name of the tag" },
    { name: "created_at", type: "timestamp", description: "When the tag was created" },
    { name: "source", type: "tag_source", description: "Source of the tag as a stringified enum value" },
  ],
};

const enumValues = {
  trace_type: ["DEFAULT", "EVALUATION"],
  span_type: ["DEFAULT", "LLM", "EXECUTOR", "EVALUATOR", "EVALUATION", "TOOL"],
  tag_source: ["HUMAN", "CODE"],
};

const TABLE_NAMES = Object.keys(tableSchemas);
const VIRTUAL_TABLES = new Set(["evaluator_scores", "evaluation_scores"]);

const TABLE_COLUMN_PATTERN =
  /\b(spans|traces|dataset_datapoints|evaluation_datapoints|events|tags)\.(\w*)$/;

const matchesSearch = (text: string, search: string): boolean => text.toLowerCase().includes(search);
const startsWithSearch = (text: string, search: string): boolean => text.toLowerCase().startsWith(search.toLowerCase());
const createOption = (label: string, type: string, info: string, apply?: string) => ({
  label,
  type,
  info,
  apply: apply || label,
});
const isInEnumContext = (textBefore: string): boolean => /\b(span_type|trace_type|tag_source)\s*=\s*[^=\n]*$/.test(textBefore);
const getEnumType = (textBefore: string): string | null => {
  const match = textBefore.match(/\b(span_type|trace_type|tag_source)(?=\s*=)/);
  return match ? match[1] : null;
};

const createColumnOption = (column: any, tableName?: string) => {
  const prefix = tableName ? `${tableName}.` : "";
  const info = tableName
    ? `${prefix}${column.name} - ${column.type} - ${column.description}`
    : `${column.type} - ${column.description}`;

  return createOption(column.name, "property", info);
};

// Completion generators
const generateTableColumnCompletions = (tableName: string, partialColumn: string) => {
  const schema = tableSchemas[tableName as keyof typeof tableSchemas];
  if (!schema) return [];

  return schema
    .filter((column) => {
      if (column.name === "*") return true;
      return startsWithSearch(column.name, partialColumn);
    })
    .map((column) => {
      if (column.name === "*") {
        return createOption('"Your Evaluator Name"', "property", column.description, '"Your Evaluator Name"');
      }
      return createColumnOption(column);
    });
};

const generateEnumCompletions = (enumType: string, partialValue: string) => {
  const values = enumValues[enumType as keyof typeof enumValues];
  if (!values) return [];

  return values
    .filter((value) => matchesSearch(value, partialValue))
    .map((value) => createOption(value, "enum", `${enumType} enum value`, `'${value}'`));
};

const generateTableCompletions = (searchTerm: string) =>
  TABLE_NAMES.filter((tableName) => matchesSearch(tableName, searchTerm)).map((tableName) => {
    const isVirtual = VIRTUAL_TABLES.has(tableName);
    return createOption(
      tableName,
      isVirtual ? "interface" : "class",
      isVirtual ? `Virtual table: ${tableName}` : `Table containing ${tableName} data`
    );
  });

const generateEnumValueCompletions = (searchTerm: string) =>
  Object.entries(enumValues).flatMap(([enumType, values]) =>
    values
      .filter((value) => matchesSearch(value, searchTerm))
      .map((value) => createOption(value, "enum", `${enumType} enum value`, `'${value}'`))
  );

const generateColumnCompletions = (searchTerm: string) =>
  Object.entries(tableSchemas).flatMap(([tableName, columns]) =>
    columns
      .filter((column) => column.name !== "*" && matchesSearch(column.name, searchTerm))
      .map((column) => createColumnOption(column, tableName))
  );

const generateGeneralCompletions = (searchTerm: string) => [
  ...generateTableCompletions(searchTerm),
  ...generateEnumValueCompletions(searchTerm),
  ...generateColumnCompletions(searchTerm),
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
  const tableColumnMatch = textBefore.match(TABLE_COLUMN_PATTERN);
  if (tableColumnMatch) {
    return generateTableColumnCompletions(tableColumnMatch[1], tableColumnMatch[2]);
  }

  if (isInEnumContext(textBefore)) {
    const enumType = getEnumType(textBefore);
    if (enumType) {
      return generateEnumCompletions(enumType, searchTerm);
    }
  }

  return generateGeneralCompletions(searchTerm);
};

const sqlAutocomplete = autocompletion({
  override: [
    (context) => {
      const word = context.matchBefore(/\w*/);
      if (!word || (word.from === word.to && !context.explicit)) {
        return null;
      }

      const textBefore = context.state.doc.sliceString(0, context.pos);
      const searchTerm = word.text.toLowerCase();

      const options = generateCompletions(textBefore, searchTerm);
      const sortedOptions = sortByRelevance(options, searchTerm);

      return {
        from: word.from,
        options: sortedOptions.slice(0, 50),
      };
    },
  ],
});

export const theme = createTheme({
  theme: "dark",
  settings: {
    ...defaultThemeSettings,
    fontSize: 14,
  },
  styles: githubDarkStyle,
});

export const extensions = [
  ...baseExtensions,
  EditorView.lineWrapping,
  sql(),
  sqlAutocomplete,
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
