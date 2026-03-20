import { convertToModelMessages, smoothStream, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";

import { getGlobalAgentSystemPrompt } from "@/lib/actions/agent/prompt";
import { executeQuery } from "@/lib/actions/sql";
import { getTraceStructureAsString } from "@/lib/actions/trace/agent/spans";
import { getLanguageModel } from "@/lib/ai/model";

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const { messages, context } = await req.json();

    const traceId = context?.traceId as string | undefined;

    const systemPrompt = getGlobalAgentSystemPrompt({ traceId });

    const result = streamText({
      model: getLanguageModel("default"),
      messages: convertToModelMessages(messages as UIMessage[]),
      stopWhen: stepCountIs(10),
      maxRetries: 5,
      system: systemPrompt,
      tools: {
        compactTraceContext: tool({
          description:
            "Get a compact summary of a trace's structure including span skeleton and detailed LLM/Tool span data. " +
            "Use this when the user asks about a specific trace — summarization, errors, flow analysis, etc.",
          inputSchema: z.object({
            traceId: z.string().describe("The trace ID to analyze"),
          }),
          execute: async ({ traceId: toolTraceId }) => {
            const { traceString } = await getTraceStructureAsString(projectId, toolTraceId);
            return traceString;
          },
        }),
        executeSql: tool({
          description:
            "Execute a ClickHouse SQL SELECT query against the platform database. " +
            "Use this for data questions about traces, spans, costs, tokens, evaluations, signals, logs, and datasets. " +
            "Only SELECT queries are allowed.",
          inputSchema: z.object({
            query: z.string().describe("The ClickHouse SQL SELECT query to execute"),
          }),
          execute: async ({ query }) => {
            const rows = await executeQuery({ projectId, query });
            if (Array.isArray(rows) && rows.length > 100) {
              return {
                rows: rows.slice(0, 100),
                totalRows: rows.length,
                truncated: true,
                message: `Showing first 100 of ${rows.length} rows. Add LIMIT to your query for smaller results.`,
              };
            }
            return { rows, totalRows: Array.isArray(rows) ? rows.length : 0, truncated: false };
          },
        }),
      },
      experimental_transform: smoothStream(),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Error in global agent API:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Internal Server Error" }, { status: 500 });
  }
}
