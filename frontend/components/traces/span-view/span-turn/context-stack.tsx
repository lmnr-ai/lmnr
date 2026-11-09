import { upperFirst } from "lodash";
import { ChevronDown } from "lucide-react";
import { memo } from "react";

import { ElevatedSurface } from "@/components/ui/surface";
import { cn, pluralize } from "@/lib/utils";

interface ContextStackProps {
  summary: string;
  open: boolean;
  onToggle: () => void;
  /** Search matches inside the folded messages. */
  searchHits?: number;
}

const EDGE = "h-1.5 -mt-px border border-t-0 rounded-b-lg";

/** The system prompt + earlier steps: a folded stack of cards, or the header of the railed list it opens into. */
const ContextStack = ({ summary, open, onToggle, searchHits }: ContextStackProps) => (
  <div className={cn("flex flex-col", !open && "pb-4")}>
    <ElevatedSurface offset={1} className="relative z-2 border rounded-lg overflow-clip">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:overlay-hover"
      >
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            !open && "-rotate-90"
          )}
        />
        <span className="min-w-0 truncate font-medium text-secondary-foreground">{upperFirst(summary)}</span>
        {!!searchHits && (
          <span className="shrink-0 rounded px-1.5 text-xs bg-primary/20 text-primary">
            {pluralize(searchHits, "match", "matches")}
          </span>
        )}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{open ? "Collapse" : "Expand"}</span>
      </button>
    </ElevatedSurface>
    {open ? (
      <div className="ml-1.5 h-3 border-l" />
    ) : (
      <>
        <ElevatedSurface offset={1} className={cn(EDGE, "relative z-1 mx-1.5")} />
        <ElevatedSurface offset={1} className={cn(EDGE, "mx-3")} />
      </>
    )}
  </div>
);

export default memo(ContextStack);
