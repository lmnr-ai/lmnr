import { z } from "zod/v4";

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

// Subset of the app-server `TestSignalRunResult` (`signals::private::test_signal`) the UI renders.
const SignalTestStatsSchema = z.object({
  stepsTaken: z.number(),
  durationMs: z.number(),
  model: z.string(),
  totalTokens: z.number(),
  totalCostUsd: z.number(),
});

const SignalTestResultSchema = z.discriminatedUnion("result", [
  z.object({
    result: z.literal("event"),
    finding: z.object({
      attributes: z.record(z.string(), z.unknown()).nullable(),
      summaries: z.array(z.string()),
      severity: z.number(),
    }),
    stats: SignalTestStatsSchema,
  }),
  z.object({ result: z.literal("noEvent"), stats: SignalTestStatsSchema }),
  z.object({ result: z.literal("failed"), error: z.string(), stats: SignalTestStatsSchema }),
]);

export type SignalTestResult = z.infer<typeof SignalTestResultSchema>;

export const executeSignal = async (input: z.infer<typeof ExecuteSignalSchema>): Promise<SignalTestResult> => {
  const { projectId, traceId, signal, llmProfileId, model } = ExecuteSignalSchema.parse(input);

  // Inline definition (not `signalId`) so unsaved form edits are what gets tested.
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1/projects/${projectId}/signal-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      traceId,
      signalPrompt: signal.prompt,
      structuredOutputSchema: signal.structured_output_schema,
      llmProfileId,
      model,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    let message = text || `Signal test failed with status ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.error === "string") message = parsed.error;
    } catch {
      // non-JSON error body, use as-is
    }
    throw new Error(message);
  }

  return SignalTestResultSchema.parse(await res.json());
};
