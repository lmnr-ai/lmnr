export type CardId = "input-extraction" | "dashboards" | "sql" | "annotation" | "screen-recording" | "search";

export interface CardCopy {
  id: CardId;
  title: string;
  description: string;
  href: string;
}

export const CARDS: CardCopy[] = [
  {
    id: "input-extraction",
    title: "Automatic agent input extraction",
    description:
      "Laminar parses the task prompt out of every run, however deep it is buried, so a trace opens on what was asked.",
    href: "https://laminar.sh/docs/platform/viewing-traces#inputs-to-every-agent-and-subagent-surfaced-for-free",
  },
  {
    id: "dashboards",
    title: "Custom Dashboards",
    description: "Build dashboards to track statistics from traces and signals with custom SQL queries.",
    href: "https://laminar.sh/docs/custom-dashboards/overview",
  },
  {
    id: "sql",
    title: "Full SQL access to all platform data",
    description: "Query all platform data with raw SQL. Have your coding agent query data with MCP or CLI.",
    href: "https://laminar.sh/docs/platform/sql-editor",
  },
  {
    id: "annotation",
    title: "UI for fast data annotation",
    description: "Build labeled datasets from traces, dataset rows, or SQL results for evals and fine-tuning.",
    href: "https://laminar.sh/docs/queues/quickstart",
  },
  {
    id: "screen-recording",
    title: "Screen recording for browser agents",
    description: "Capture your agent's browser session alongside the trace.",
    href: "https://laminar.sh/docs/tracing/browser-agent-observability",
  },
  {
    id: "search",
    title: "Extremely fast full-text search",
    description: "Full-text search across every span input, output, and attribute.",
    href: "https://laminar.sh/docs/platform/search#full-text-search",
  },
];
