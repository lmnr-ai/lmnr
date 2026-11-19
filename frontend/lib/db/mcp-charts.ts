import { ChartType } from "@/components/chart-builder/types";
import { type DashboardChart } from "@/components/dashboards/types";

export const MCP_DASHBOARD_NAME = "MCP";

// MCP tool calls are the TOOL spans the OTel MCP conventions mark with `mcp.method.name`
// ("tools/call"). `error.type` "-32602" is invalid params: bad arguments or an unknown tool.
// `lmnr.mcp.client.name` is set by the Laminar SDKs' MCP server instrumentation from the client's
// `initialize`.
const TOOL_CALLS = `span_type = 'TOOL'
  AND JSONExtractString(attributes, 'mcp.method.name') = 'tools/call'
  AND start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}`;
const TOOL = `JSONExtractString(attributes, 'gen_ai.tool.name') AS tool`;
const CLIENT = `if(JSONExtractString(attributes, 'lmnr.mcp.client.name') = '', 'unknown', JSONExtractString(attributes, 'lmnr.mcp.client.name')) AS client`;
const ERROR_RATE = `round(100 * countIf(status = 'error') / count(), 2)`;
const INVALID_ARGUMENT_RATE = `round(100 * countIf(JSONExtractString(attributes, 'error.type') = '-32602') / count(), 2)`;
const TIME_FILL = `WITH FILL
FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})`;

const mcpCharts: Omit<DashboardChart, "id" | "createdAt" | "dashboardId">[] = [
  {
    name: "Tool calls",
    query: `
SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    ${TOOL},
    count() AS calls
FROM spans
WHERE
    ${TOOL_CALLS}
GROUP BY time, tool
ORDER BY time
${TIME_FILL}
    `,
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "calls",
        breakdown: "tool",
        total: true,
      },
      layout: { x: 0, y: 0, w: 6, h: 6 },
    },
  },
  {
    name: "Tool calls by client",
    query: `
SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    ${CLIENT},
    count() AS calls
FROM spans
WHERE
    ${TOOL_CALLS}
GROUP BY time, client
ORDER BY time
${TIME_FILL}
    `,
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "calls",
        breakdown: "client",
        total: true,
      },
      layout: { x: 6, y: 0, w: 6, h: 6 },
    },
  },
  {
    name: "Error rate by tool (%)",
    query: `
SELECT
    ${TOOL},
    ${ERROR_RATE} AS error_rate
FROM spans
WHERE
    ${TOOL_CALLS}
GROUP BY tool
ORDER BY error_rate DESC
LIMIT 10
    `,
    settings: {
      config: {
        type: ChartType.HorizontalBarChart,
        x: "error_rate",
        y: "tool",
      },
      layout: { x: 0, y: 6, w: 4, h: 6 },
    },
  },
  {
    name: "Invalid-argument rate by tool (%)",
    query: `
SELECT
    ${TOOL},
    ${INVALID_ARGUMENT_RATE} AS invalid_argument_rate
FROM spans
WHERE
    ${TOOL_CALLS}
GROUP BY tool
ORDER BY invalid_argument_rate DESC
LIMIT 10
    `,
    settings: {
      config: {
        type: ChartType.HorizontalBarChart,
        x: "invalid_argument_rate",
        y: "tool",
      },
      layout: { x: 4, y: 6, w: 4, h: 6 },
    },
  },
  {
    name: "Latency by tool (p95, s)",
    query: `
SELECT
    ${TOOL},
    round(quantile(0.95)(duration), 3) AS p95_latency
FROM spans
WHERE
    ${TOOL_CALLS}
GROUP BY tool
ORDER BY p95_latency DESC
LIMIT 10
    `,
    settings: {
      config: {
        type: ChartType.HorizontalBarChart,
        x: "p95_latency",
        y: "tool",
      },
      layout: { x: 8, y: 6, w: 4, h: 6 },
    },
  },
  {
    name: "Tools by client",
    query: `
SELECT
    ${TOOL},
    ${CLIENT},
    count() AS calls,
    ${ERROR_RATE} AS error_rate_pct,
    ${INVALID_ARGUMENT_RATE} AS invalid_argument_rate_pct,
    round(quantile(0.95)(duration), 3) AS p95_latency_s
FROM spans
WHERE
    ${TOOL_CALLS}
GROUP BY tool, client
ORDER BY calls DESC
LIMIT 100
    `,
    settings: {
      config: {
        type: ChartType.Table,
      },
      layout: { x: 0, y: 12, w: 12, h: 8 },
    },
  },
];

export default mcpCharts;
