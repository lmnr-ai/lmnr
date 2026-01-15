import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

const ExecuteSemanticEventSchema = z.object({
  projectId: z.string(),
  traceId: z.guid(),
  eventDefinition: z.object({
    prompt: z.string().min(1, { error: "Prompt is required" }),
    structured_output_schema: z.record(z.string(), z.unknown()),
  }),
});

const SemanticEventResponseSchema = z.object({
  success: z.boolean(),
  attributes: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
});

const EnvironmentSchema = z.object({
  SEMANTIC_EVENT_SERVICE_SECRET_KEY: z.string({ error: "SEMANTIC_EVENT_SERVICE_SECRET_KEY is required" }),
  SEMANTIC_EVENT_SERVICE_URL: z.string({ error: "SEMANTIC_EVENT_SERVICE_URL is required" }),
});

const getEnvironmentVariables = () => {
  const env = {
    SEMANTIC_EVENT_SERVICE_SECRET_KEY: process.env.SEMANTIC_EVENT_SERVICE_SECRET_KEY,
    SEMANTIC_EVENT_SERVICE_URL: process.env.SEMANTIC_EVENT_SERVICE_URL,
  };

  return EnvironmentSchema.parse(env);
};

const getRequestHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "User-Agent": "lmnr-semantic-event/1.0",
});

const callSemanticEventService = async (
  url: string,
  headers: Record<string, string>,
  requestBody: { project_id: string; trace_id: string; event_definition: any }
): Promise<z.infer<typeof SemanticEventResponseSchema>> => {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorResponse = await response.json().catch(() => ({ error: "Unexpected response body" }));
    throw new Error(errorResponse.error || JSON.stringify(errorResponse));
  }

  const responseData = await response.json();
  return SemanticEventResponseSchema.parse(responseData);
};

export const executeSemanticEvent = async (input: z.infer<typeof ExecuteSemanticEventSchema>) => {
  const { SEMANTIC_EVENT_SERVICE_SECRET_KEY, SEMANTIC_EVENT_SERVICE_URL } = getEnvironmentVariables();
  const { projectId, traceId, eventDefinition } = ExecuteSemanticEventSchema.parse(input);

  const [trace] = await executeQuery<{ exists: number }>({
    query: `
      SELECT 1 as exists
      FROM traces
      WHERE id = {traceId: UUID}
      LIMIT 1
    `,
    projectId,
    parameters: {
      traceId,
    },
  });

  if (!trace || trace.exists === 0) {
    throw new Error("Trace not found or does not belong to this project.");
  }

  const requestBody = {
    project_id: projectId,
    trace_id: traceId,
    event_definition: { ...eventDefinition, name: "" },
  };

  const headers = getRequestHeaders(SEMANTIC_EVENT_SERVICE_SECRET_KEY);

  const semanticEventResponse = await callSemanticEventService(SEMANTIC_EVENT_SERVICE_URL, headers, requestBody);

  if (semanticEventResponse.error) {
    throw new Error(semanticEventResponse.error);
  }

  return semanticEventResponse?.attributes || "Event was not identified in trace.";
};
