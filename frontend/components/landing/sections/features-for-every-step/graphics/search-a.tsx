import { Search } from "lucide-react";

// The search box, then the span it landed in. The match is lit where it
// actually lives, inside `output` and `attributes`, marked the way the
// product's own SnippetPreview marks a hit.
const Hit = ({ children }: { children: string }) => (
  <span className="rounded-[2px] bg-primary-400/25 px-[3px] text-primary-200">{children}</span>
);

const SearchA = () => (
  <div className="absolute inset-0 overflow-hidden pl-[22px]">
    <div className="flex items-center gap-2 rounded-l border-y border-l border-surface-up-3 bg-surface-down px-2 py-[7px]">
      <Search className="size-3 shrink-0 text-foreground-500" strokeWidth={1.75} />
      <span className="text-[11px] text-white">timeout</span>
      <span className="h-3 w-px animate-pulse bg-white/70" />
      <span className="ml-auto shrink-0 px-1 text-[9px] text-foreground-600">⌘K</span>
    </div>

    <p className="mt-2 text-[10px] text-foreground-500">
      1,284 spans <span className="text-foreground-300">in 38 ms</span>
    </p>

    <div className="mt-2 flex items-center justify-between rounded-tl border-t border-l border-surface-up-2 bg-surface-down px-3 py-2 pr-6">
      <span className="text-[11px] text-foreground-100">chat.completion</span>
      <span className="rounded-full bg-primary-400/15 px-1.5 py-[1px] font-mono text-[9px] text-primary-200">+2</span>
    </div>

    <div className="mt-2 rounded-tl border-t border-l border-surface-up-2 bg-surface-down px-3 py-2.5 font-mono text-[10px] leading-[16px] text-foreground-300">
      <p className="text-foreground-500">output</p>
      <p className="mt-1">
        The request hit a <Hit>timeout</Hit> at the
      </p>
      <p>
        booking gateway. Retried once, same <Hit>timeout</Hit>,
      </p>
      <p>then fell back to the cached fare.</p>

      <p className="mt-2.5 text-foreground-500">attributes</p>
      <p className="mt-1">
        error.type = <Hit>timeout</Hit>
      </p>
      <p>http.status_code = 504</p>
    </div>
  </div>
);

export default SearchA;
