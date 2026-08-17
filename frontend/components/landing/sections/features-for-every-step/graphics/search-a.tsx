import { Search } from "lucide-react";

// The product's search box, then its hits. The match is lit where it actually
// lives, inside each span's own text, because the index covers the payload.
const HITS = [
  { path: "agent.run / plan_task", before: "retry after ", after: " on tool call" },
  { path: "browse_flights / fetch", before: "connection ", after: " while loading" },
  { path: "chat.completion", before: "handled ", after: " and returned" },
  { path: "book_seat / submit", before: "gateway ", after: " after 30s" },
];

const SearchA = () => (
  <div className="absolute inset-0 overflow-hidden pl-6">
    <div className="flex items-center gap-2 rounded-l border-y border-l border-surface-up-3 bg-surface-down px-2 py-[7px]">
      <Search className="size-3 shrink-0 text-foreground-500" strokeWidth={1.75} />
      <span className="text-[11px] text-white">timeout</span>
      <span className="h-3 w-px animate-pulse bg-white/70" />
      <span className="ml-auto shrink-0 rounded-sm px-1 text-[9px] text-foreground-600">⌘K</span>
    </div>

    <p className="mt-2.5 text-[10px] text-foreground-500">
      1,284 spans <span className="text-foreground-300">in 38 ms</span>
    </p>

    <div className="mt-2.5 flex flex-col gap-1.5">
      {HITS.map((hit) => (
        <div key={hit.path} className="rounded-l border-y border-l border-surface-up-2 bg-surface-down p-2">
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
