import { Search } from "lucide-react";

// Full text plus structure: the free-text term narrows by attribute filters, and
// the count updates as fast as you can type.
const FILTERS = ["span_type = LLM", "status = error", "path ~ subagent"];

const RESULTS = [
  { before: "gateway ", after: " after 30s" },
  { before: "socket ", after: " on retry 2" },
  { before: "read ", after: " from upstream" },
];

const SearchC = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="flex items-center gap-2 rounded-l border-y border-l border-surface-350 bg-surface-200 px-2.5 py-2">
      <Search className="size-3 shrink-0 text-foreground-500" strokeWidth={1.75} />
      <span className="font-mono text-[11px] text-white">timeout</span>
      <span className="h-3 w-px animate-pulse bg-white/70" />
    </div>

    <div className="mt-2 flex flex-wrap gap-1.5">
      {FILTERS.map((filter) => (
        <span
          key={filter}
          className="rounded border border-surface-400 bg-surface-200 px-1.5 py-[3px] font-mono text-[9px] text-foreground-400"
        >
          {filter}
        </span>
      ))}
    </div>

    <div className="mt-3 flex items-baseline gap-1.5">
      <span className="font-mono text-2xl leading-7 text-white">1,284</span>
      <span className="text-[10px] text-foreground-500">spans in 38 ms</span>
    </div>

    <div className="mt-3 flex flex-col gap-1.5">
      {RESULTS.map((result) => (
        <p key={result.before} className="truncate text-[10px] text-foreground-300">
          {result.before}
          <span className="rounded-[2px] bg-primary-400/25 px-[3px] text-primary-200">timeout</span>
          {result.after}
        </p>
      ))}
    </div>
  </div>
);

export default SearchC;
