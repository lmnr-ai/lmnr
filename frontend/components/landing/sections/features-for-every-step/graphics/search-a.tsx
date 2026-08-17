import { Search } from "lucide-react";

// Hits with the match lit inside each span's own text, plus the count and
// latency that make "extremely fast" concrete.
const HITS = [
  { path: "agent.run / plan_task", before: "retry after ", after: " on tool call" },
  { path: "subagent.browse / fetch", before: "connection ", after: " while loading" },
  { path: "chat.completion", before: "handled ", after: " and returned" },
  { path: "tool.book / submit", before: "gateway ", after: " after 30s" },
];

const SearchA = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="flex items-center gap-2 rounded-l border-y border-l border-surface-350 bg-surface-200 px-2.5 py-2">
      <Search className="size-3 shrink-0 text-foreground-500" strokeWidth={1.75} />
      <span className="font-mono text-[11px] text-white">timeout</span>
      <span className="h-3 w-px animate-pulse bg-white/70" />
    </div>

    <p className="mt-2 text-[10px] text-foreground-500">
      1,284 spans <span className="text-foreground-300">in 38 ms</span>
    </p>

    <div className="mt-2 flex flex-col gap-1.5">
      {HITS.map((hit) => (
        <div key={hit.path} className="rounded-l border-y border-l border-surface-350 bg-surface-200 p-2">
          <p className="truncate font-mono text-[9px] text-foreground-500">{hit.path}</p>
          <p className="mt-1 truncate text-[10px] text-foreground-200">
            {hit.before}
            <span className="rounded-[2px] bg-primary-400/25 px-[3px] text-primary-200">timeout</span>
            {hit.after}
          </p>
        </div>
      ))}
    </div>
  </div>
);

export default SearchA;
