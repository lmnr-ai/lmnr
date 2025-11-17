export type ColumnType = "string" | "number";

export interface ColumnDefinition {
  name: string;
  type: ColumnType;
  description: string;
}

export const tableSchemas: Record<string, ColumnDefinition[]> = {
  spans: [
    { name: "span_id", type: "string", description: "Unique identifier for the span" },
    { name: "status", type: "string", description: "Status of the span" },
    { name: "name", type: "string", description: "Name of the span" },
    { name: "path", type: "string", description: "Hierarchical path of the span" },
    { name: "parent_span_id", type: "string", description: "ID of the parent span" },
    { name: "span_type", type: "string", description: "Type of the span" },
    { name: "duration", type: "number", description: "Duration in seconds" },
    { name: "input", type: "string", description: "Input data for the span" },
    { name: "output", type: "string", description: "Output data from the span" },
    { name: "request_model", type: "string", description: "LLM model specified in the request" },
    { name: "response_model", type: "string", description: "LLM model returned in the response" },
    { name: "model", type: "string", description: "LLM model used" },
    { name: "provider", type: "string", description: "LLM provider" },
    { name: "input_tokens", type: "number", description: "Number of input tokens" },
    { name: "output_tokens", type: "number", description: "Number of output tokens" },
    { name: "total_tokens", type: "number", description: "Total tokens used" },
    { name: "input_cost", type: "number", description: "Cost for input tokens" },
    { name: "output_cost", type: "number", description: "Cost for output tokens" },
    { name: "total_cost", type: "number", description: "Total cost of the span" },
    { name: "attributes", type: "string", description: "Span attributes" },
    { name: "trace_id", type: "string", description: "ID of the trace" },
    { name: "tags", type: "string", description: "Tags associated with the span" },
  ],
  traces: [
    { name: "id", type: "string", description: "Unique identifier for the trace" },
    { name: "trace_type", type: "string", description: "Type of the trace" },
    { name: "metadata", type: "string", description: "Trace metadata" },
    { name: "duration", type: "number", description: "Duration in seconds" },
    { name: "input_tokens", type: "number", description: "Number of input tokens" },
    { name: "output_tokens", type: "number", description: "Number of output tokens" },
    { name: "total_tokens", type: "number", description: "Total tokens used" },
    { name: "input_cost", type: "number", description: "Cost for input tokens" },
    { name: "output_cost", type: "number", description: "Cost for output tokens" },
    { name: "total_cost", type: "number", description: "Total cost of the trace" },
    { name: "status", type: "string", description: "Status of the trace" },
    { name: "user_id", type: "string", description: "User ID sent with the trace" },
    { name: "session_id", type: "string", description: "Session identifier" },
    { name: "top_span_id", type: "string", description: "ID of the top-level span" },
    { name: "top_span_name", type: "string", description: "Name of the top-level span" },
    { name: "top_span_type", type: "string", description: "Type of the top-level span" },
  ],
  events: [
    { name: "id", type: "string", description: "Unique identifier for the event" },
    { name: "span_id", type: "string", description: "Identifier of the span" },
    { name: "name", type: "string", description: "Name of the event" },
    { name: "timestamp", type: "number", description: "When the event occurred" },
    { name: "attributes", type: "string", description: "Attributes of the event" },
    { name: "trace_id", type: "string", description: "Identifier of the trace" },
    { name: "user_id", type: "string", description: "User ID associated with the event" },
    { name: "session_id", type: "string", description: "Session ID associated with the event" },
  ],
  tags: [
    { name: "id", type: "string", description: "Unique identifier for the tag" },
    { name: "span_id", type: "string", description: "Identifier of the span" },
    { name: "name", type: "string", description: "Name of the tag" },
    { name: "created_at", type: "number", description: "When the tag was created" },
    { name: "source", type: "string", description: "Source of the tag" },
  ],
};

const requiresNumericColumn = (fn: string): boolean =>
  fn === "sum" || fn === "avg" || fn === "min" || fn === "max" || fn === "quantile";

export const getAvailableColumns = (table: string, metricFn?: string): ColumnDefinition[] => {
  const schema = tableSchemas[table];
  if (!schema) return [];

  if (!metricFn || metricFn === "count") {
    return [{ name: "*", type: "string", description: "All columns" }, ...schema];
  }

  if (requiresNumericColumn(metricFn)) {
    return schema.filter((col) => col.type === "number");
  }

  return schema;
};

