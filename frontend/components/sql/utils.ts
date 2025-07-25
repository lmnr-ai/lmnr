import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { sql } from "@codemirror/lang-sql";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { createTheme } from "@uiw/codemirror-themes";

import { baseExtensions, defaultThemeSettings, githubDarkStyle } from "@/components/ui/code-highlighter/utils";

const tableSchemas = {
  spans: [
    // Core columns
    { name: "span_id", type: "uuid", description: "Unique identifier for the span" },
    { name: "created_at", type: "timestamp", description: "When the span was created" },
    { name: "parent_span_id", type: "uuid", description: "ID of the parent span" },
    { name: "name", type: "text", description: "Name of the span" },
    { name: "attributes", type: "jsonb", description: "Span attributes as JSON" },
    { name: "input", type: "jsonb", description: "Input data for the span" },
    { name: "output", type: "jsonb", description: "Output data from the span" },
    {
      name: "span_type",
      type: "span_type",
      description: "Type of span (DEFAULT, LLM, EXECUTOR, EVALUATOR, EVALUATION, TOOL)",
    },
    { name: "start_time", type: "timestamp", description: "When the span started" },
    { name: "end_time", type: "timestamp", description: "When the span ended" },
    { name: "trace_id", type: "uuid", description: "ID of the parent trace" },
    { name: "status", type: "text", description: "Status of the span" },

    // Virtual columns from Laminar docs
    { name: "path", type: "virtual", description: "Hierarchical path of the span (e.g., 'outer.inner')" },
    { name: "duration", type: "virtual", description: "Duration in seconds (end_time - start_time)" },
    { name: "tag", type: "virtual", description: "Individual tag for filtering (use WHERE tag = 'my_tag')" },
    { name: "tags", type: "text[]", description: "Array of all tags associated with the span" },
    { name: "evaluation_name", type: "virtual", description: "Name of the evaluation (joined from evaluation)" },
    { name: "evaluation_id", type: "virtual", description: "ID of the evaluation (joined from evaluation)" },
  ],
  traces: [
    // Core columns
    { name: "id", type: "uuid", description: "Unique identifier for the trace" },
    { name: "session_id", type: "text", description: "Session identifier" },
    { name: "metadata", type: "jsonb", description: "Trace metadata as JSON" },
    { name: "end_time", type: "timestamp", description: "When the trace ended" },
    { name: "start_time", type: "timestamp", description: "When the trace started" },
    { name: "total_token_count", type: "bigint", description: "Total tokens used" },
    { name: "cost", type: "double precision", description: "Total cost of the trace" },
    { name: "created_at", type: "timestamp", description: "When the trace was created" },
    { name: "trace_type", type: "trace_type", description: "Type of trace (DEFAULT, EVALUATION)" },
    { name: "input_token_count", type: "bigint", description: "Number of input tokens" },
    { name: "output_token_count", type: "bigint", description: "Number of output tokens" },
    { name: "input_cost", type: "double precision", description: "Cost for input tokens" },
    { name: "output_cost", type: "double precision", description: "Cost for output tokens" },
    { name: "top_span_id", type: "uuid", description: "ID of the top-level span" },
    { name: "status", type: "text", description: "Status of the trace" },
    { name: "user_id", type: "text", description: "User ID sent with the trace" },

    // Virtual columns
    { name: "duration", type: "virtual", description: "Duration in seconds (end_time - start_time)" },
    { name: "evaluation_name", type: "virtual", description: "Name of the evaluation (joined from evaluation)" },
    { name: "evaluation_id", type: "virtual", description: "ID of the evaluation (joined from evaluation)" },
  ],
  datasets: [
    { name: "id", type: "uuid", description: "Unique identifier for the dataset" },
    { name: "created_at", type: "timestamp", description: "When the dataset was created" },
    { name: "name", type: "text", description: "Name of the dataset" },
  ],
  evaluations: [
    { name: "id", type: "uuid", description: "Unique identifier for the evaluation" },
    { name: "created_at", type: "timestamp", description: "When the evaluation was created" },
    { name: "name", type: "text", description: "Name of the evaluation" },
    { name: "group_id", type: "text", description: "Group identifier for the evaluation" },
  ],
  evaluation_results: [
    { name: "id", type: "uuid", description: "Unique identifier for the evaluation result" },
    { name: "created_at", type: "timestamp", description: "When the result was created" },
    { name: "evaluation_id", type: "uuid", description: "ID of the parent evaluation" },
    { name: "data", type: "jsonb", description: "Input data for the evaluation" },
    { name: "target", type: "jsonb", description: "Target/expected output" },
    { name: "metadata", type: "jsonb", description: "Additional metadata" },
    { name: "executor_output", type: "jsonb", description: "Output from the executor" },
    { name: "trace_id", type: "uuid", description: "ID of the associated trace" },
    { name: "index", type: "integer", description: "Index of the result in the batch" },

    // Virtual trace details available in evaluation_results
    { name: "cost", type: "virtual", description: "Cost from associated trace" },
    { name: "total_token_count", type: "virtual", description: "Token count from associated trace" },
    { name: "start_time", type: "virtual", description: "Start time from associated trace" },
    { name: "end_time", type: "virtual", description: "End time from associated trace" },
    { name: "duration", type: "virtual", description: "Duration in seconds from associated trace" },
  ],

  evaluator_scores: [
    {
      name: "*",
      type: "dynamic",
      description: 'Use evaluator names as columns (e.g., evaluator_scores."Task alignment")',
    },
  ],
  evaluation_scores: [
    { name: "*", type: "dynamic", description: 'Use score names as columns (e.g., evaluation_scores."My Score")' },
  ],
};

const enumValues = {
  trace_type: ["DEFAULT", "EVALUATION"],
  span_type: ["DEFAULT", "LLM", "EXECUTOR", "EVALUATOR", "EVALUATION", "TOOL"],
};

const TABLE_NAMES = Object.keys(tableSchemas);
const VIRTUAL_TABLES = new Set(["evaluator_scores", "evaluation_scores"]);

const TABLE_COLUMN_PATTERN =
  /\b(spans|traces|evaluations|evaluation_results|datasets|evaluator_scores|evaluation_scores)\.(\w*)$/;

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

const createColumnOption = (column: any, tableName?: string) => {
  const isVirtual = column.type === "virtual";
  const prefix = tableName ? `${tableName}.` : "";
  const info = tableName
    ? `${prefix}${column.name} - ${column.type} - ${column.description}`
    : `${column.type} - ${column.description}`;

  return createOption(column.name, isVirtual ? "method" : "property", info);
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
