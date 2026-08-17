import { Search, X } from "lucide-react";

// One box does both. Filter tags sit inline with the free text, each split into
// field, operator and value, exactly as the product composes them.
const TAGS = [
  ["span_type", "=", "LLM"],
  ["status", "=", "error"],
];

const RESULTS = [
  { before: "gateway ", after: " after 30s" },
  { before: "socket ", after: " on retry 2" },
  { before: "read ", after: " from upstream" },
];

const SearchC = () => (
  <div className="absolute inset-0 overflow-hidden pl-6">
    <div className="flex items-start gap-1.5 rounded-l border-y border-l border-surface-up-3 bg-surface-down px-2 py-1.5">
      <Search className="mt-1 size-3 shrink-0 text-foreground-500" strokeWidth={1.75} />
      <div className="flex flex-wrap items-center gap-1">
        {TAGS.map(([field, op, value]) => (
          <span
            key={field}
            className="inline-flex h-[19px] items-center divide-x divide-surface-up-3 rounded border border-surface-up-3 bg-surface-down-2 font-mono text-[9px]"
          >
            <span className="px-1 text-foreground-300">{field}</span>
            <span className="px-1 text-foreground-500">{op}</span>
            <span className="px-1 text-foreground-100">{value}</span>
            <span className="px-[3px]">
              <X className="size-2 text-foreground-600" strokeWidth={2.5} />
            </span>
          </span>
        ))}
        <span className="text-[11px] text-white">timeout</span>
        <span className="h-3 w-px animate-pulse bg-white/70" />
      </div>
    </div>

    <div className="mt-3.5 flex items-baseline gap-1.5">
      <span className="font-mono text-2xl leading-7 text-white">1,284</span>
      <span className="text-[10px] text-foreground-500">spans in 38 ms</span>
    </div>

    <div className="mt-3 flex flex-col gap-2">
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
