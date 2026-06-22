"use client";

import { Bug, Database, FlaskConical, LayoutDashboard, ListTree, TextSearch } from "lucide-react";

const HIGHLIGHTS = [
  { icon: ListTree, title: "Trace every step", description: "Every LLM call, tool, and subagent in one trace tree." },
  { icon: Bug, title: "Debug & rerun", description: "Rerun your agent from any step to reproduce and fix fast." },
  {
    icon: LayoutDashboard,
    title: "Custom dashboards",
    description: "Track cost, latency, and errors on dashboards built with SQL.",
  },
  { icon: FlaskConical, title: "Evaluate quality", description: "Run evals on production data to catch regressions." },
  { icon: Database, title: "Full SQL access", description: "Query all your data in SQL, or via MCP from your agent." },
  {
    icon: TextSearch,
    title: "Full-text search",
    description: "Search across every span input, output, and attribute.",
  },
];

export function PlatformHighlights() {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-secondary-foreground">With Laminar, you can:</h3>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
          <div key={title} className="flex items-start gap-2.5">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-secondary-foreground">{title}</span>
              <span className="text-xs leading-snug text-muted-foreground">{description}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
