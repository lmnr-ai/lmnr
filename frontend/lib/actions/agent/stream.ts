import { google } from "@ai-sdk/google";
import { convertToModelMessages, smoothStream, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";

import { executeQuery } from "@/lib/actions/sql";
import { getTraceStructureAsString } from "@/lib/actions/trace/agent/spans";

import { buildLaminarAgentPrompt, type UrlContext } from "./prompt";

export const AgentStreamChatSchema = z.object({
  messages: z.array(z.any()).describe("Array of UI messages"),
  projectId: z.string().describe("The project ID"),
  urlContext: z
    .object({
      pageType: z.string(),
      ids: z.record(z.string(), z.string()),
      systemPromptFragment: z.string(),
    })
    .optional()
    .describe("URL-based context about the current page"),
});

export const streamAgentChat = async (input: z.infer<typeof AgentStreamChatSchema>) => {
  const { messages: uiMessages, projectId, urlContext } = input;

  const result = streamText({
    model: google("gemini-2.5-flash"),
    messages: convertToModelMessages(uiMessages as UIMessage[]),
    maxRetries: 5,
    stopWhen: stepCountIs(10),
    system: buildLaminarAgentPrompt(urlContext as UrlContext | undefined),
    tools: {
      querySQL: tool({
        description:
          "Execute a SQL query against the project's ClickHouse database. Use this to answer data questions about traces, spans, evaluations, costs, latency, token usage, error rates, trends, and any quantitative analysis. The query is automatically scoped to the current project.",
        inputSchema: z.object({
          query: z.string().describe("The ClickHouse SQL query to execute"),
        }),
        execute: async ({ query }) => {
          try {
            const results = await executeQuery({ projectId, query });
            return JSON.stringify(results);
          } catch (error) {
            return JSON.stringify({
              error: error instanceof Error ? error.message : "Query execution failed",
            });
          }
        },
      }),
      getTraceSkeleton: tool({
        description:
          "Get the structure and detailed span information for a specific trace. Returns a YAML skeleton showing all spans with their hierarchy, plus detailed input/output for LLM and TOOL spans. Use this when the user asks about a specific trace by ID, wants to understand what happened in a trace, or is debugging a particular trace.",
        inputSchema: z.object({
          traceId: z.string().describe("The UUID of the trace to inspect"),
        }),
        execute: async ({ traceId }) => {
          try {
            const { traceString } = await getTraceStructureAsString(projectId, traceId);
            return traceString;
          } catch (error) {
            return JSON.stringify({
              error: error instanceof Error ? error.message : "Failed to fetch trace structure",
            });
          }
        },
      }),
    },
    experimental_transform: smoothStream(),
  });

  return result;
};
