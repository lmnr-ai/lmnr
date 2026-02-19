import { enumValues, resolveTableSchemas, type TableSchema } from "@/components/sql/utils";

import type { GenerationMode } from "./types";

interface ModeConfig {
  tables: string[];
  prompt: string;
}
const SHARED_RULES = `<rules>
You ONLY generate SQL for the available tables and columns.

If the request is unrelated to SQL, data querying, or the available schema, respond with:
- success: false
- error: brief explanation why the request cannot be fulfilled

- Use ClickHouse SQL syntax
- Prefer efficient functions: use simpleJSONExtract* over JSONExtract* when possible
- No explanations or comments in the SQL output
</rules>`;

function buildTableSchemaText(schemas: Record<string, TableSchema>): string {
  return Object.entries(schemas)
    .map(([tableName, tableData]) => {
      const columns = tableData.columns.map((col) => `  ${col.name} (${col.type}) - ${col.description}`).join("\n");
      return `${tableName}: ${tableData.description}\n${columns}`;
    })
    .join("\n\n");
}

function buildEnumSchemaText(): string {
  return Object.entries(enumValues)
    .map(([enumName, values]) => `- ${enumName}: ${values.map((v) => `'${v}'`).join(", ")}`)
    .join("\n");
}

const queryMode: ModeConfig = {
  tables: [],
  prompt: `<task>
Generate a valid ClickHouse SELECT query.

Format the query with each clause on a new line:
SELECT columns
FROM table
WHERE conditions
ORDER BY columns
LIMIT n

Additional rules:
- Only generate SELECT queries
- Join relationships: spans.trace_id = traces.id, signal_events.trace_id = traces.id
</task>

<examples>
Recent traces:
SELECT id, start_time, total_cost
FROM traces
ORDER BY start_time DESC
LIMIT 10

LLM spans:
SELECT name, model, input, output
FROM spans
WHERE span_type = 'LLM'
</examples>`,
};

const evalExpressionMode: ModeConfig = {
  tables: ["evaluation_datapoints"],
  prompt: `<task>
Generate a ClickHouse SQL expression (NOT a full query).
This expression will be used as a custom column: SELECT expression FROM evaluation_datapoints

Output only the expression - no SELECT, FROM, or WHERE clauses.
</task>

<examples>
Count spans: arrayCount(x -> 1, trace_spans)
Extract JSON string: simpleJSONExtractString(metadata, 'key')
Get score value: simpleJSONExtractFloat(scores, 'accuracy')
Calculate percentage: round(output_tokens * 100.0 / nullIf(total_tokens, 0), 2)
Conditional value: if(total_cost > 0.01, 'expensive', 'cheap')
</examples>`,
};

const MODE_CONFIGS: Record<GenerationMode, ModeConfig> = {
  query: queryMode,
  "eval-expression": evalExpressionMode,
};

export function getGenerationPrompts(mode: GenerationMode = "query", currentQuery?: string) {
  const config = MODE_CONFIGS[mode];
  const schemas = resolveTableSchemas(config.tables.length > 0 ? { tables: config.tables } : undefined);
  const tableSchema = buildTableSchemaText(schemas);
  const enumSchema = buildEnumSchemaText();

  const currentQueryContext = currentQuery?.trim()
    ? `
<current_query>
${currentQuery}
</current_query>

When the user asks to modify, add to, or change the existing query, use this as the base and apply the requested changes.`
    : "";

  const systemPrompt = `You are a SQL generator for Laminar, an open-source observability platform for LLM applications.
Laminar uses ClickHouse as its analytics database.

${SHARED_RULES}

${config.prompt}
${currentQueryContext}

<schema>
${tableSchema}
</schema>

<enums>
${enumSchema}
</enums>`;

  return {
    system: systemPrompt,
    user: (prompt: string) => prompt,
  };
}
