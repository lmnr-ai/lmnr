import { Search } from "lucide-react";

// The search box and the payload it lit up. The match is marked where it
// actually lives, inside `output` and `attributes`, the way the product's own
// SnippetPreview marks a hit.
const Hit = ({ children }: { children: string }) => (
  <span className="rounded-[2px] bg-primary-400/25 px-[3px] text-primary-200">{children}</span>
);

const FullTextSearch = () => (
  <div className="absolute inset-0 overflow-hidden">
    <div className="flex items-center gap-2 rounded-l border-y border-l border-surface-up-3 bg-surface-down px-2 py-[7px]">
      <Search className="size-3 shrink-0 text-foreground-500" strokeWidth={1.75} />
      {/* Caret rides in the same box as the query, so it sits on the last
          letter instead of a flex gap away from it. */}
      <span className="flex min-w-0 flex-1 items-center text-[11px] text-white">
        timeout
        <span className="ml-px h-3 w-px shrink-0 animate-pulse bg-white/70" />
      </span>
      <span className="shrink-0 px-1 text-[9px] text-foreground-600">⌘K</span>
    </div>

    <div className="mt-2.5 rounded-tl border-t border-l border-surface-up-2 bg-surface-down px-3 py-2.5 font-mono text-[10px] leading-[16px] text-foreground-300">
      <p className="text-foreground-500">output</p>
      <p className="mt-1">
        The request hit a <Hit>timeout</Hit> at the booking gateway after 30s.
      </p>
      <p>
        Retried once and saw the same <Hit>timeout</Hit>, then fell back to the
      </p>
      <p>cached fare quote from the previous search.</p>

      <p className="mt-2.5 text-foreground-500">attributes</p>
      <p className="mt-1">
        error.type = <Hit>timeout</Hit>
      </p>
      <p>
        error.message = upstream <Hit>timeout</Hit> after 30000ms
      </p>
      <p>http.status_code = 504</p>
      <p>http.route = /v1/offers/search</p>
      <p>retry.count = 1</p>
      <p>gen_ai.request.model = gpt-5.1</p>
    </div>
  </div>
);

export default FullTextSearch;
