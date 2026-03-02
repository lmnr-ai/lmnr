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

  // Rich UI widget tools - these render as visual components in the chat
  tools.renderTraceCard = tool({
    description:
      "Render a trace summary card in the chat. Use this when the user asks about a trace to show them a visual summary with key stats and a condensed timeline. The spans array should contain timing information for each span to render the timeline bars.",
    inputSchema: z.object({
      traceId: z.string().describe("The trace ID"),
      topSpanName: z.string().describe("Name of the top-level span"),
      status: z.string().describe("Trace status: 'ok' or 'error'"),
      durationMs: z.number().describe("Total trace duration in milliseconds"),
      totalTokens: z.number().optional().describe("Total token count across all spans"),
      totalCost: z.number().optional().describe("Total cost in dollars"),
      startTime: z.string().describe("ISO timestamp of trace start"),
      spans: z
        .array(
          z.object({
            name: z.string(),
            spanType: z.string().describe("One of: DEFAULT, LLM, EXECUTOR, EVALUATOR, TOOL, EVENT, CACHED"),
            startOffsetPercent: z.number().describe("Start position as percentage of total trace duration (0-100)"),
            widthPercent: z.number().describe("Width as percentage of total trace duration (0-100)"),
            status: z.string().optional(),
          })
        )
        .describe("Spans to display in the condensed timeline"),
    }),
    execute: async (data) => JSON.stringify({ _widget: "traceCard", ...data }),
  });

  tools.renderDiffView = tool({
    description:
      "Render a word-level text diff in the chat. Use this when the user asks to compare two spans, two outputs, two prompts, or any two pieces of text. Shows additions in green and removals in red with inline and side-by-side views.",
    inputSchema: z.object({
      leftLabel: z.string().describe("Label for the left/original text (e.g. span name, 'Before', 'Span A')"),
      rightLabel: z.string().describe("Label for the right/changed text (e.g. span name, 'After', 'Span B')"),
      leftText: z.string().describe("The original/left text to compare"),
      rightText: z.string().describe("The changed/right text to compare"),
    }),
    execute: async (data) => JSON.stringify({ _widget: "diffView", ...data }),
  });

  tools.renderSpanBreakdown = tool({
    description:
      "Render a waterfall-style span breakdown in the chat. Use this when the user asks about trace performance, what's slow, or wants to see the execution timeline. Shows each span as a bar with timing information.",
    inputSchema: z.object({
      traceId: z.string().describe("The trace ID"),
      totalDurationMs: z.number().describe("Total trace duration in milliseconds"),
      spans: z
        .array(
          z.object({
            name: z.string().describe("Span name"),
            spanType: z.string().describe("One of: DEFAULT, LLM, EXECUTOR, EVALUATOR, TOOL, EVENT, CACHED"),
            durationMs: z.number().describe("Span duration in milliseconds"),
            startOffsetMs: z.number().describe("Start time offset from trace start in milliseconds"),
            totalDurationMs: z.number().describe("Total trace duration (same as parent field)"),
            tokens: z.number().optional().describe("Token count for this span"),
            cost: z.number().optional().describe("Cost for this span"),
            status: z.string().optional().describe("Span status"),
            model: z.string().optional().describe("Model name if LLM span"),
            depth: z.number().describe("Nesting depth (0 for root)"),
          })
        )
        .describe("Spans to display in the breakdown"),
    }),
    execute: async (data) => JSON.stringify({ _widget: "spanBreakdown", ...data }),
  });

  tools.renderMetricsTable = tool({
    description:
      "Render a metrics table in the chat. Use this when presenting aggregate statistics, comparisons between time periods, evaluation scores, or any key-value data with optional trend indicators.",
    inputSchema: z.object({
      title: z
        .string()
        .describe("Table title (e.g. 'Trace Statistics', 'Evaluation Scores', 'Performance Comparison')"),
      rows: z
        .array(
          z.object({
            label: z.string().describe("Metric name"),
            value: z.union([z.string(), z.number()]).describe("Current value"),
            previousValue: z.union([z.string(), z.number()]).optional().describe("Previous value for comparison"),
            changePercent: z.number().optional().describe("Percentage change (positive = up, negative = down)"),
            unit: z.string().optional().describe("Unit: '$', 'ms', 's', '%', or omit for plain numbers"),
          })
        )
        .describe("Rows of metrics to display"),
    }),
    execute: async (data) => JSON.stringify({ _widget: "metricsTable", ...data }),
  });

  tools.renderErrorSummary = tool({
    description:
      "Render an error summary card in the chat. Use this when the user asks about errors, failures, or exceptions in a trace. Shows all errors with expandable details.",
    inputSchema: z.object({
      traceId: z.string().describe("The trace ID"),
      errorCount: z.number().describe("Total number of errors"),
      errors: z
        .array(
          z.object({
            spanName: z.string().describe("Name of the span that errored"),
            spanType: z.string().describe("Type of the span"),
            errorType: z.string().describe("Exception/error type"),
            errorMessage: z.string().describe("Error message"),
            stacktracePreview: z.string().optional().describe("First few lines of stack trace"),
          })
        )
        .describe("Error details"),
    }),
    execute: async (data) => JSON.stringify({ _widget: "errorSummary", ...data }),
  });

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
