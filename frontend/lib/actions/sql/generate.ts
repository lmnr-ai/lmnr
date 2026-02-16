import { google } from "@ai-sdk/google";
import { generateText } from "ai";

import { enumValues, resolveTableSchemas, type SQLSchemaConfig, type TableSchema } from "@/components/sql/utils";

function buildTableSchemaPrompt(schemas: Record<string, TableSchema>): string {
  return Object.entries(schemas)
    .map(([tableName, tableData]) => {
      const columns = tableData.columns.map((col) => `${col.name} (${col.type}) - ${col.description}`).join("\n  ");
      return `${tableName}: ${tableData.description}\n  ${columns}`;
    })
    .join("\n\n");
}

function buildEnumPrompt(): string {
  return Object.entries(enumValues)
    .map(([enumName, values]) => `- ${enumName}: ${values.map((v) => `'${v}'`).join(", ")}`)
    .join("\n");
}

function buildSystemPrompt(schemaConfig?: SQLSchemaConfig): string {
  const resolvedSchemas = resolveTableSchemas(schemaConfig);
  const tableSchemaPrompt = buildTableSchemaPrompt(resolvedSchemas);
  const enumPrompt = buildEnumPrompt();

  return `You are a SQL query generator for Laminar, an open-source observability platform for LLM applications.
Laminar uses ClickHouse as its analytics database. Generate ONLY valid ClickHouse SELECT queries.

Available tables and their columns:

${tableSchemaPrompt}

Enum types:
${enumPrompt}

Join relationships:
- spans.trace_id = traces.id
- signal_events.trace_id = traces.id

Example queries:
- Recent traces: SELECT id, start_time, total_cost FROM traces ORDER BY start_time DESC LIMIT 10
- LLM spans: SELECT name, model, input, output FROM spans WHERE span_type = 'LLM'
- Errors: SELECT trace_id, name, status FROM spans WHERE status = 'error'

Rules:
- Only generate SELECT queries
- Use ClickHouse SQL syntax
- Return ONLY the raw SQL query with no explanations, comments, or markdown formatting
- Do not wrap the query in code fences or backticks`;
}

function stripCodeFences(text: string): string {
  let result = text.trim();
  const fenceMatch = result.match(/^```(?:sql)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    result = fenceMatch[1].trim();
  }
  return result;
}

export async function generateSqlQuery(prompt: string, schemaConfig?: SQLSchemaConfig): Promise<string> {
  const systemPrompt = buildSystemPrompt(schemaConfig);

  const result = await generateText({
    model: google("gemini-3-flash-preview"),
    system: systemPrompt,
    prompt: `Generate a ClickHouse SQL query for the following request:\n\n${prompt}`,
  });

  return stripCodeFences(result.text);
}
