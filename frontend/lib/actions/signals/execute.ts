import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

const ExecuteSignalSchema = z.object({
  projectId: z.string(),
  traceId: z.guid(),
  signal: z.object({
    prompt: z.string().min(1, { error: "Prompt is required" }),
    structured_output_schema: z.record(z.string(), z.unknown()),
  }),
});

const SignalResponseSchema = z.object({
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

const callSignalService = async (
  url: string,
  headers: Record<string, string>,
  requestBody: { project_id: string; trace_id: string; event_definition: any }
): Promise<z.infer<typeof SignalResponseSchema>> => {
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
  return SignalResponseSchema.parse(responseData);
};

export const executeSignal = async (input: z.infer<typeof ExecuteSignalSchema>) => {
  const { SEMANTIC_EVENT_SERVICE_SECRET_KEY, SEMANTIC_EVENT_SERVICE_URL } = getEnvironmentVariables();
  const { projectId, traceId, signal } = ExecuteSignalSchema.parse(input);

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
    event_definition: { ...signal, name: "" },
  };

  const headers = getRequestHeaders(SEMANTIC_EVENT_SERVICE_SECRET_KEY);

  const signalResponse = await callSignalService(SEMANTIC_EVENT_SERVICE_URL, headers, requestBody);

  if (signalResponse.error) {
    throw new Error(signalResponse.error);
  }

  return signalResponse?.attributes || "Event was not identified in trace.";
};
