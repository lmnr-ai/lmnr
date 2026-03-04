import { createAnthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { convertToModelMessages, smoothStream, stepCountIs, streamText, tool, type UIMessage } from "ai";
import YAML from "yaml";
import { z } from "zod";

import { executeQuery } from "@/lib/actions/sql";
import type { AIPageContext } from "@/lib/ai-chat/store";

import { getSpansByIds, getTraceStructureAsString } from "../trace/agent/spans";
import { buildSystemPrompt } from "./prompt";

function getModel() {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return google("gemini-2.5-flash");
  }
  let baseURL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  // The @ai-sdk/anthropic appends /messages to the baseURL directly,
  // so we need to include /v1 in the base URL
  if (!baseURL.endsWith("/v1")) {
    baseURL = baseURL + "/v1";
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const anthropic = createAnthropic({ baseURL, apiKey });
  return anthropic("claude-sonnet-4-20250514");
}

export const SidePanelStreamChatSchema = z.object({
  messages: z.array(z.any()).describe("Array of UI messages"),
  projectId: z.string().describe("The project ID"),
  pageContext: z.any().describe("The current page context"),
});

export async function streamSidePanelChat(input: z.infer<typeof SidePanelStreamChatSchema>) {
  const { messages: uiMessages, projectId, pageContext } = input;
  const ctx = pageContext as AIPageContext;

  // If we have a trace in context, fetch its structure
  let traceString: string | undefined;
  const traceId = ctx.traceView?.traceId;

  if (traceId) {
    try {
      const result = await getTraceStructureAsString(projectId, traceId);
      traceString = result.traceString;
    } catch (e) {
      console.error("Failed to fetch trace structure for side panel:", e);
    }
  }

  const systemPrompt = buildSystemPrompt(ctx, traceString);

  // Build tools
  const tools: Record<string, any> = {};

  // Add span data tool if we have a trace
  if (traceId) {
    tools.getSpansData = tool({
      description:
        "Get the data (input, output, start time, end time, status, events) of spans in the trace by span ids",
      inputSchema: z.object({
        spanIds: z.array(z.int()).describe("List of span ids to get the data for"),
      }),
      execute: async ({ spanIds }) => {
        const spans = await getSpansByIds(projectId, traceId, spanIds);
        return YAML.stringify(spans);
      },
    });
  }

  // Always add SQL query tool
  tools.executeSQL = tool({
    description:
      "Execute a SQL query against the project's ClickHouse database. Use this to answer questions about traces, spans, evaluations, and other observability data. Always include LIMIT in queries.",
    inputSchema: z.object({
      query: z.string().describe("The SQL query to execute. Must include LIMIT clause."),
    }),
    execute: async ({ query }) => {
      try {
        const results = await executeQuery({
          projectId,
          query,
        });
        const limitedResults = Array.isArray(results) ? results.slice(0, 100) : results;
        return JSON.stringify(limitedResults, null, 2);
      } catch (e) {
        return JSON.stringify({
          error: e instanceof Error ? e.message : "Failed to execute SQL query",
        });
      }
    },
  });

  const modelMessages = convertToModelMessages(uiMessages as UIMessage[]);

  const result = streamText({
    model: getModel(),
    messages: modelMessages,
    stopWhen: stepCountIs(10),
    maxRetries: 3,
    system: systemPrompt,
    tools,
    experimental_transform: smoothStream(),
  });

  return result;
}
