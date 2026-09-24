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
    { name: "cache_read_input_tokens", type: "number", description: "Tokens read from prompt cache" },
    { name: "cache_creation_input_tokens", type: "number", description: "Tokens written to prompt cache" },
    { name: "reasoning_tokens", type: "number", description: "Reasoning tokens" },
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
    {
      name: "cache_read_input_tokens",
      type: "number",
      description: "Tokens read from prompt cache, summed across LLM spans",
    },
    {
      name: "cache_creation_input_tokens",
      type: "number",
      description: "Tokens written to prompt cache, summed across LLM spans",
    },
    { name: "reasoning_tokens", type: "number", description: "Reasoning tokens, summed across LLM spans" },
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
  signal_events: [
    { name: "id", type: "string", description: "Unique identifier for the signal event" },
    { name: "signal_id", type: "string", description: "Unique identifier for the signal" },
    { name: "trace_id", type: "string", description: "Unique identifier for the trace" },
    { name: "run_id", type: "string", description: "Unique identifier for the run" },
    { name: "name", type: "string", description: "Name of the signal event" },
    { name: "payload", type: "string", description: "Payload of the signal event as stringified JSON" },
    { name: "timestamp", type: "number", description: "When the signal event occurred" },
    { name: "severity", type: "number", description: "Severity of the signal event" },
  ],
  signals: [
    { name: "id", type: "string", description: "Unique identifier for the signal" },
    { name: "name", type: "string", description: "Signal name" },
    { name: "prompt", type: "string", description: "Signal definition prompt" },
    { name: "structured_output_schema", type: "string", description: "JSON schema of the signal's output" },
    { name: "metadata", type: "string", description: "Signal metadata, as a JSON object" },
    { name: "llm_model", type: "string", description: "Model the signal runs on" },
    { name: "created_at", type: "string", description: "When the signal was created" },
    { name: "version", type: "number", description: "Current definition version" },
  ],
  evaluations: [
    { name: "id", type: "string", description: "Unique identifier for the evaluation" },
    { name: "name", type: "string", description: "Evaluation name" },
    { name: "group_id", type: "string", description: "Group identifier of the evaluation run" },
    { name: "created_at", type: "string", description: "When the evaluation was created" },
  ],
  datasets: [
    { name: "id", type: "string", description: "Unique identifier for the dataset" },
    { name: "name", type: "string", description: "Dataset name" },
    { name: "created_at", type: "string", description: "When the dataset was created" },
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

export const getTimeColumn = (table: string): string => {
  const timeColumnMap: Record<string, string> = {
    spans: "start_time",
    traces: "start_time",
    signal_events: "timestamp",
  };

  return timeColumnMap[table] || "start_time";
};
