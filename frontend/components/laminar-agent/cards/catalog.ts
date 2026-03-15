import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react";
import { z } from "zod";

export const agentCatalog = defineCatalog(schema, {
  components: {
    TraceCard: {
      props: z.object({
        traceId: z.string().describe("The UUID of the trace"),
        topSpanName: z.string().describe("Name of the root span"),
        duration: z.number().describe("Duration in seconds"),
        totalCost: z.number().describe("Total cost in USD"),
        totalTokens: z.number().describe("Total token count"),
        timestamp: z.string().describe("ISO timestamp of the trace start"),
        status: z.string().describe("'success' or 'error'"),
      }),
      description:
        "Display a trace summary card with top span name, duration, cost, tokens, timestamp, and a button to open the trace. Use when discussing a specific trace.",
    },
    MetricsCard: {
      props: z.object({
        title: z.string().nullable().describe("Optional card title"),
        metrics: z
          .array(
            z.object({
              label: z.string(),
              value: z.string().describe("Formatted display value"),
            })
          )
          .describe("Array of metric label/value pairs"),
      }),
      description:
        "Display aggregated metrics in a grid. Use for stats, durations, costs, counts, averages, and any numeric summaries.",
    },
    ListCard: {
      props: z.object({
        title: z.string().nullable().describe("Optional list title"),
        items: z.array(z.string()).describe("Array of list item strings"),
        numbered: z.boolean().describe("Whether items should be numbered"),
      }),
      description:
        "Display a list of items. Use for enumerating models, clusters, signals, traces, or any enumerable results.",
    },
    CreateSignalCard: {
      props: z.object({
        signalName: z.string().describe("Suggested name for the signal"),
        signalDescription: z.string().describe("Description of what the signal detects"),
        prompt: z.string().describe("The prompt/instruction for the signal evaluator"),
      }),
      description:
        "Suggest creating a new signal/monitor. Use PROACTIVELY when detecting errors, anomalies, or issues that should be monitored. Shows a button to navigate to the signals page.",
    },
    QuerySQLCard: {
      props: z.object({
        query: z.string().describe("The SQL query that was executed"),
      }),
      description:
        "Display a compact SQL query card with expand, copy, and open-in-editor buttons. Render this EVERY TIME a SQL query is executed.",
    },
    GraphCard: {
      props: z.object({
        title: z.string().nullable().describe("Optional chart title"),
        chartType: z.enum(["line", "bar", "horizontalBar"]).describe("Type of chart to render"),
        xColumn: z.string().describe("Column name for x-axis"),
        yColumn: z.string().describe("Column name for y-axis"),
        data: z.array(z.record(z.string(), z.unknown())).describe("Array of data objects from SQL query results"),
      }),
      description:
        "Render a chart (line, bar, or horizontal bar) from SQL query data. Use when the user asks about trends, volumes, distributions, or any visual data representation over time.",
    },
  },
  actions: {},
});
