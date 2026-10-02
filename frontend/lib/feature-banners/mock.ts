import { type FeatureBanner } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

// Dates are relative to load time so the mocks never go stale while prototyping.
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

export const MOCK_FEATURE_BANNERS: FeatureBanner[] = [
  {
    id: "debugger",
    title: "Debugger",
    description: "Rerun your agent from any step without starting over.",
    image_src: "/blog/2026-03-16-debugger.png",
    long_description: `Iterating on a long-running agent used to mean re-running the whole thing to test a one-line prompt change.

With the **Debugger** you can:

- Pick any LLM span in a trace and **replay from that point**
- Edit the system prompt and re-run instantly
- Keep cached results for every step before the checkpoint

\`\`\`bash
npx lmnr-cli dev agent.ts
\`\`\`

[Read the docs](https://laminar.sh/docs)`,
    open_source: true,
    created_at: daysFromNow(-3),
    expires_at: daysFromNow(27),
  },
  {
    id: "signals",
    title: "Signals",
    description: "Describe a behavior in plain English and catch it in every trace.",
    image_src: "/blog/2026-03-16-signals.png",
    long_description: `**Signals** turn natural-language descriptions into structured events extracted from your traces.

1. Describe what to look for, e.g. *"the agent apologized to the user"*
2. Laminar runs it over incoming traces
3. Chart, alert, and cluster the resulting events

Signals is available on Laminar Cloud.`,
    open_source: false,
    created_at: daysFromNow(-7),
    expires_at: daysFromNow(23),
  },
  {
    id: "sql-editor",
    title: "SQL editor",
    description: "Query spans, traces, and evals directly with SQL.",
    image_src: "/blog/2026-02-13-sql-editor.png",
    long_description: `All of your data is now queryable with SQL.

\`\`\`sql
SELECT name, avg(end_time - start_time) AS latency
FROM spans
WHERE span_type = 'LLM'
GROUP BY name
ORDER BY latency DESC
\`\`\`

Save queries, export results to datasets, and build dashboards on top of them.`,
    open_source: true,
    created_at: daysFromNow(-12),
    expires_at: daysFromNow(18),
  },
  {
    id: "custom-dashboards",
    title: "Custom dashboards",
    description: "Build charts from any SQL query and pin them to a dashboard.",
    image_src: "/blog/2026-02-05-dashboard.png",
    open_source: true,
    created_at: daysFromNow(-20),
    expires_at: daysFromNow(10),
  },
  {
    id: "expired-example",
    title: "Expired feature",
    description: "This banner is past its expires_at and should never render.",
    image_src: "/blog/2026-01-20-flame.png",
    open_source: true,
    created_at: daysFromNow(-60),
    expires_at: daysFromNow(-30),
  },
];
