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

    // Trace summary visualization tool
    tools.renderTraceSummary = tool({
      description:
        "Render a rich visual trace summary card in the chat. Use this when the user asks about a specific trace or wants an overview. " +
        "You must provide the trace data based on what you know from the trace structure in context. " +
        "This renders a visual card with status, duration, tokens, cost, and a condensed timeline of top-level spans.",
      inputSchema: z.object({
        traceId: z.string().describe("The trace ID"),
        name: z.string().describe("The name of the top-level span or trace"),
        status: z.string().describe("Trace status: 'OK' or 'error'"),
        startTime: z.string().describe("ISO timestamp of trace start"),
        endTime: z.string().describe("ISO timestamp of trace end"),
        totalTokens: z.number().describe("Total token count"),
        inputTokens: z.number().describe("Input token count"),
        outputTokens: z.number().describe("Output token count"),
        totalCost: z.number().describe("Total cost in USD"),
        spanCount: z.number().describe("Total number of spans in the trace"),
        topLevelSpans: z
          .array(
            z.object({
              name: z.string(),
              spanType: z.string().describe("e.g. LLM, TOOL, DEFAULT, EXECUTOR"),
              durationMs: z.number().describe("Duration in milliseconds"),
              status: z.string().optional().describe("'OK' or 'error'"),
            })
          )
          .describe("Top-level spans to show in the timeline (up to 8)"),
      }),
      execute: async (params) => JSON.stringify(params),
    });

    // Span tree visualization tool
    tools.renderSpanTree = tool({
      description:
        "Render a visual hierarchical span tree in the chat. Use this when the user wants to see the structure of a trace or understand the call hierarchy. " +
        "Build the tree from the trace structure you have in context.",
      inputSchema: z.object({
        traceId: z.string().describe("The trace ID"),
        totalDurationMs: z.number().describe("Total trace duration in milliseconds"),
        rootSpans: z
          .array(
            z.object({
              spanId: z.string().describe("Span sequential ID"),
              name: z.string(),
              spanType: z.string(),
              durationMs: z.number(),
              status: z.string().optional(),
              model: z.string().optional().describe("Model name for LLM spans"),
              inputTokens: z.number().optional(),
              outputTokens: z.number().optional(),
              children: z.array(z.any()).describe("Nested child spans with the same structure"),
            })
          )
          .describe("Root-level spans with nested children"),
      }),
      execute: async (params) => JSON.stringify(params),
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

  // Metrics grid visualization tool
  tools.renderMetrics = tool({
    description:
      "Render a visual metrics grid card in the chat. Use this to display key metrics with optional trend indicators. " +
      "Great for answering questions like 'how many traces', 'what's the average latency', 'token usage stats', etc. " +
      "Call this AFTER you've gathered the data (e.g. via executeSQL) to present it visually.",
    inputSchema: z.object({
      title: z.string().optional().describe("Optional title for the metrics card"),
      metrics: z
        .array(
          z.object({
            label: z.string().describe("Metric name, e.g. 'Total Traces'"),
            value: z.string().describe("Formatted value, e.g. '1,234' or '$0.52'"),
            change: z
              .number()
              .optional()
              .describe("Percentage change from previous period. Positive = up, negative = down."),
            changeLabel: z.string().optional().describe("Label for the change, e.g. 'vs last 24h'"),
          })
        )
        .describe("List of metrics to display (2-6 items)"),
    }),
    execute: async (params) => JSON.stringify(params),
  });

  // SQL results table visualization tool
  tools.renderSQLResults = tool({
    description:
      "Render SQL query results as a formatted table in the chat. Use this AFTER executeSQL to display results visually. " +
      "Converts raw SQL results into a clean table with column headers, formatted cells, and row counts.",
    inputSchema: z.object({
      query: z.string().describe("The SQL query that was executed"),
      columns: z.array(z.string()).describe("Column names in display order"),
      rows: z.array(z.record(z.string(), z.unknown())).describe("Array of row objects keyed by column name"),
      totalRows: z.number().optional().describe("Total number of rows before LIMIT"),
      executionTimeMs: z.number().optional().describe("Approximate execution time in milliseconds"),
    }),
    execute: async (params) => JSON.stringify(params),
  });

  // Eval score card visualization tool
  tools.renderEvalScores = tool({
    description:
      "Render an evaluation scores card with mini distribution charts. Use this when discussing evaluation results. " +
      "Shows score averages, min/max ranges, distribution, and optional pass rate.",
    inputSchema: z.object({
      evaluationId: z.string().describe("The evaluation ID"),
      evaluationName: z.string().describe("The evaluation name"),
      totalDatapoints: z.number().describe("Total number of datapoints in the evaluation"),
      passRate: z.number().optional().describe("Pass rate as a fraction 0-1"),
      scores: z
        .array(
          z.object({
            name: z.string().describe("Score name, e.g. 'accuracy'"),
            average: z.number().describe("Average score value"),
            min: z.number().describe("Minimum score value"),
            max: z.number().describe("Maximum score value"),
            distribution: z.array(z.number()).describe("Array of 8-12 bucket heights for the mini histogram"),
          })
        )
        .describe("List of scores to display"),
    }),
    execute: async (params) => JSON.stringify(params),
  });

  // Cost breakdown chart visualization tool
  tools.renderCostBreakdown = tool({
    description:
      "Render a cost/token/count breakdown chart with stacked bar and itemized list. " +
      "Use this to visualize cost distribution by model, token usage by type, trace counts by status, latency by span, etc. " +
      "Call this AFTER you've gathered breakdown data via executeSQL.",
    inputSchema: z.object({
      title: z.string().optional().describe("Chart title, e.g. 'Cost by Model'"),
      format: z.enum(["currency", "tokens", "count", "duration"]).describe("How to format values"),
      total: z.number().describe("Total value (sum of all items)"),
      items: z
        .array(
          z.object({
            label: z.string().describe("Item name, e.g. 'gpt-4o'"),
            value: z.number().describe("Item value"),
            detail: z.string().optional().describe("Extra detail text, e.g. '42% of calls'"),
          })
        )
        .describe("Breakdown items sorted by value descending"),
    }),
    execute: async (params) => JSON.stringify(params),
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
