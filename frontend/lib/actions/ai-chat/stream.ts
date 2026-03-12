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

  // --- Rich render tools ---
  // These tools render structured visual components in the chat UI.
  // The AI calls them with structured data, and the frontend renders rich components.

  tools.renderTraceSummary = tool({
    description:
      "Render a rich trace summary card in the chat. Use this when summarizing a trace to show a visual overview with status, duration, top-level spans, and cost. The card includes a link to open the full trace view.",
    inputSchema: z.object({
      traceId: z.string().describe("The trace ID"),
      status: z.enum(["success", "error", "partial"]).describe("Overall trace status"),
      startTime: z.string().describe("ISO timestamp of trace start"),
      endTime: z.string().describe("ISO timestamp of trace end"),
      totalSpans: z.number().describe("Total number of spans in the trace"),
      errorCount: z.number().describe("Number of spans with errors"),
      topLevelSpans: z
        .array(
          z.object({
            name: z.string(),
            spanId: z.string(),
            status: z.string(),
            durationMs: z.number(),
          })
        )
        .describe("Top-level spans with their durations"),
      totalTokens: z.number().optional().describe("Total tokens used across all LLM spans"),
      totalCost: z.number().optional().describe("Total cost in USD"),
      summary: z.string().describe("Brief human-readable summary of what the trace did"),
    }),
    execute: async (data) => JSON.stringify(data),
  });

  tools.renderMetrics = tool({
    description:
      "Render a metrics card showing key statistics. Use this to present numerical metrics like latency, token usage, costs, or counts in a visually clear grid layout with optional change indicators.",
    inputSchema: z.object({
      title: z.string().describe("Title for the metrics card"),
      metrics: z
        .array(
          z.object({
            label: z.string().describe("Metric label"),
            value: z.union([z.number(), z.string()]).describe("Metric value"),
            format: z
              .enum(["number", "currency", "percent", "duration", "tokens"])
              .optional()
              .describe("How to format the value"),
            change: z.number().optional().describe("Percentage change from previous period"),
            lowerIsBetter: z.boolean().optional().describe("If true, a decrease is good (e.g. latency, error rate, cost)"),
            description: z.string().optional().describe("Additional context for the metric"),
          })
        )
        .describe("Array of metrics to display"),
    }),
    execute: async (data) => JSON.stringify(data),
  });

  tools.renderSpanTimeline = tool({
    description:
      "Render a visual span timeline (waterfall chart) showing when each span started and how long it took relative to the trace. Use this when the user asks about trace timing, latency breakdown, or span execution order.",
    inputSchema: z.object({
      traceId: z.string().describe("The trace ID"),
      totalDurationMs: z.number().describe("Total trace duration in milliseconds"),
      spans: z
        .array(
          z.object({
            spanId: z.string(),
            name: z.string(),
            startOffsetMs: z.number().describe("Start time offset from trace start in ms"),
            durationMs: z.number().describe("Span duration in ms"),
            status: z.enum(["success", "error", "pending"]),
            depth: z.number().describe("Nesting depth (0 for root spans)"),
            spanType: z.string().optional().describe("Span type like 'llm', 'tool', 'chain'"),
          })
        )
        .describe("Spans to display on the timeline"),
    }),
    execute: async (data) => JSON.stringify(data),
  });

  tools.renderErrorAnalysis = tool({
    description:
      "Render an error analysis card showing error patterns, counts, and severity. Use this when the user asks about errors, failures, or issues across traces or within a specific trace.",
    inputSchema: z.object({
      totalErrors: z.number().describe("Total number of errors"),
      timeRange: z.string().describe("Time range description like 'Last 24 hours'"),
      errors: z
        .array(
          z.object({
            message: z.string().describe("Error message"),
            count: z.number().describe("Number of occurrences"),
            firstSeen: z.string().describe("ISO timestamp of first occurrence"),
            lastSeen: z.string().describe("ISO timestamp of last occurrence"),
            spanName: z.string().optional().describe("Name of the span where error occurred"),
            severity: z.enum(["critical", "error", "warning"]),
          })
        )
        .describe("Error details"),
      summary: z.string().describe("Brief analysis summary of the error patterns"),
    }),
    execute: async (data) => JSON.stringify(data),
  });

  tools.renderDataTable = tool({
    description:
      "Render a rich interactive data table. Use this to display SQL query results or any tabular data. Supports sorting, badge formatting for status columns, and various data formats.",
    inputSchema: z.object({
      title: z.string().describe("Title for the table"),
      columns: z
        .array(
          z.object({
            key: z.string().describe("Column key matching row data keys"),
            label: z.string().describe("Display label for the column header"),
            format: z
              .enum(["text", "number", "currency", "duration", "date", "badge"])
              .optional()
              .describe("How to format cell values"),
          })
        )
        .describe("Column definitions"),
      rows: z.array(z.record(z.string(), z.any())).describe("Array of row data objects"),
      totalRows: z.number().optional().describe("Total rows if results are truncated"),
      query: z.string().optional().describe("The SQL query that produced these results"),
    }),
    execute: async (data) => JSON.stringify(data),
  });

  tools.renderEvalScoreCard = tool({
    description:
      "Render an evaluation score card with score distributions and statistics. Use this when the user asks about evaluation results, score distributions, or evaluation summaries.",
    inputSchema: z.object({
      evaluationName: z.string().describe("Name of the evaluation"),
      evaluationId: z.string().describe("Evaluation ID"),
      scores: z
        .array(
          z.object({
            name: z.string().describe("Score name"),
            average: z.number().describe("Average score"),
            min: z.number().describe("Minimum score"),
            max: z.number().describe("Maximum score"),
            median: z.number().describe("Median score"),
            distribution: z
              .array(z.object({ bucket: z.string(), count: z.number() }))
              .describe("Score distribution buckets"),
          })
        )
        .describe("Score data with distributions"),
      totalDatapoints: z.number().describe("Total number of evaluation datapoints"),
      summary: z.string().describe("Brief summary of evaluation results"),
    }),
    execute: async (data) => JSON.stringify(data),
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
