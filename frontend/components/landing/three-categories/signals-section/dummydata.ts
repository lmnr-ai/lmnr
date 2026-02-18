export const DEFINITION_TEXT =
  "Analyze this trace for failures, errors, or things that went wrong. Include tool failures, API errors, logical mistakes, and dead ends.";

export const SCHEMA_ROWS = [
  { name: "Category", type: "Enum", description: "Category of the failure" },
  { name: "Details", type: "String", description: "Details of what failed and why" },
  { name: "Tools", type: "Number", description: "Number of tools used" },
];

const CATEGORIES = ["tool_error", "api_error", "logic_error", "timeout", "validation_error"];

const DESCRIPTIONS = [
  "The tool get_shared_data failed to return valid results for the query...",
  "The agent attempted to fetch via curl on the remote endpoint but received...",
  "An incoming user request was misidentified as a system command due to...",
  "The second tool call made on the database mcp server timed out after...",
  "Input validation failed on the request body parameter for the batch...",
  "The tool parse_json returned malformed output when processing nested...",
  "API rate limit exceeded while attempting batch processing of embeddings...",
  "The routing logic incorrectly classified the intent as a search query...",
  "Connection timeout when reaching the external auth provider endpoint...",
  "Schema validation rejected the response format from the completions...",
  "The tool write_file encountered permission denied on the output directory...",
  "REST API returned 503 during the health check sequence for service...",
  "Conditional branch took wrong path due to null comparison in filter...",
  "Request to embeddings service exceeded 30s timeout during peak load...",
  "Field type mismatch in the aggregation pipeline stage caused silent...",
  "The tool search_index failed with corrupted query vector from cache...",
  "OAuth token refresh endpoint returned invalid grant error on rotation...",
  "Loop detection triggered false positive on recursive tool invocation...",
  "Database connection pool exhausted during peak load causing cascade...",
  "Parameter bounds check failed for the pagination offset in list query...",
];

function generateTimestamp(index: number): string {
  const day = 9 + Math.floor(index / 5);
  const hour = (8 + index * 3) % 24;
  const minute = (47 + index * 13) % 60;
  return `Jan ${day}, ${hour}:${minute.toString().padStart(2, "0")}`;
}

export const EVENTS_DATA = Array.from({ length: 30 }, (_, i) => ({
  timestamp: generateTimestamp(i),
  category: CATEGORIES[i % CATEGORIES.length],
  description: DESCRIPTIONS[i % DESCRIPTIONS.length],
}));

export const CLUSTER_NAMES = ["Incorrect tool call", "Misinterpreted user request", "API call failed"];

export function generateClusterRows(clusterIndex: number) {
  return Array.from({ length: 7 }, (_, i) => {
    const baseIndex = clusterIndex * 10 + i;
    return {
      timestamp: generateTimestamp(baseIndex % 20),
      category: CATEGORIES[(baseIndex + clusterIndex) % CATEGORIES.length],
      description: DESCRIPTIONS[baseIndex % DESCRIPTIONS.length],
    };
  });
}
