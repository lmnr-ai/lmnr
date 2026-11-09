import { ChevronDown } from "lucide-react";
import { memo } from "react";

import { cn, pluralize } from "@/lib/utils";

interface ContextStackProps {
  summary: string;
  open: boolean;
  onToggle: () => void;
  /** Search matches inside the folded messages. */
  searchHits?: number;
}

/** The system prompt + earlier steps: a folded card, or the header of the list it opens into. */
const ContextStack = ({ summary, open, onToggle, searchHits }: ContextStackProps) => (
  <div className="pb-4">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border bg-foreground/5 px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
    >
      <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")} />
      <span className="truncate">
        {open ? "Hide" : "Show"} {summary}
      </span>
      {!!searchHits && (
        <span className="shrink-0 rounded px-1.5 text-xs bg-primary/20 text-primary">
          {pluralize(searchHits, "match", "matches")}
        </span>
      )}
    </button>
  </div>
);

export default memo(ContextStack);
