import { google } from "@ai-sdk/google";
import { getTracer, observe } from "@lmnr-ai/lmnr";
import { convertToModelMessages, smoothStream, stepCountIs, streamText, tool, type UIMessage } from "ai";
import YAML from "yaml";
import { z } from "zod";

import { findOrCreateChatSession, saveChatMessage } from "./messages";
import { TraceChatPrompt } from "./prompt";
import { getSpansByIds, getTraceStructureAsString } from "./spans";

export const TraceStreamChatSchema = z.object({
  messages: z.array(z.any()).describe("Array of UI messages"),
  traceId: z.string().describe("The trace ID to analyze"),
  projectId: z.string().describe("The project ID"),
});

export const streamTraceChat = observe(
  {
    name: "streamTraceChat",
    rolloutEntrypoint: true,
  },
  async (input: z.infer<typeof TraceStreamChatSchema>) => {
    const { messages: uiMessages, traceId, projectId } = input;

    const chatId = await findOrCreateChatSession(traceId, projectId);

    const userMessage = uiMessages.filter((message) => message.role === "user").at(-1);

    await saveChatMessage({
      chatId,
      traceId,
      projectId,
      role: "user",
      parts: userMessage?.parts,
    });

    const { traceString } = await getTraceStructureAsString(projectId, traceId);

    const systemPrompt = TraceChatPrompt.replace("{{fullTraceData}}", traceString);

    const result = streamText({
      model: google("gemini-2.5-flash"),
      messages: convertToModelMessages(uiMessages as UIMessage[]),
      stopWhen: stepCountIs(10),
      maxRetries: 5,
      system: systemPrompt,
      tools: {
        getSpansData: tool({
          description:
            "Get the data (input, output, start time, end time, status, events) of spans in the trace by span ids",
          inputSchema: z.object({
            spanIds: z.array(z.int()).describe("List of span ids to get the data for"),
          }),
          execute: async ({ spanIds }) => {
            const spans = await getSpansByIds(projectId, traceId, spanIds);
            return YAML.stringify(spans);
          },
        }),
      },
      experimental_transform: smoothStream(),
      experimental_telemetry: {
        isEnabled: true,
        tracer: getTracer(),
      },
    });

    return result;
  }
);
