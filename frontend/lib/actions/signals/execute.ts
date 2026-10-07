import { z } from "zod/v4";

import { fetcherJSON } from "@/lib/utils.ts";

const ExecuteSignalSchema = z.object({
  projectId: z.guid(),
  traceId: z.guid(),
  signal: z.object({
    prompt: z.string().min(1, { error: "Prompt is required" }),
    structured_output_schema: z.record(z.string(), z.unknown()),
  }),
  // StepConfig route fields; both or neither. Absent = the server's env LLM.
  llmProfileId: z.guid().optional(),
  model: z.string().trim().min(1).optional(),
});

const SignalResponseSchema = z.object({
  success: z.boolean(),
  attributes: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
});

export const executeSignal = async (input: z.infer<typeof ExecuteSignalSchema>) => {
  const { projectId, traceId, signal, llmProfileId, model } = ExecuteSignalSchema.parse(input);

  const response = await fetcherJSON(`/projects/${projectId}/signals/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ traceId, signal, llmProfileId, model }),
  });

  const signalResponse = SignalResponseSchema.parse(response);

  if (signalResponse.error && !signalResponse.attributes) {
    throw new Error(signalResponse.error);
  }

  return signalResponse.attributes || "Event was not identified in trace.";
};
