import { ChevronUp } from "lucide-react";

import { type CollapsibleEntry } from "@/components/traces/span-view/collapsible";
import { RoleHeader } from "@/components/traces/span-view/common";
import { ElevatedSurface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

interface BandItemProps {
  entry: CollapsibleEntry;
  /** On the context rail, like the context's own cards. */
  inContext: boolean;
  onCollapse: () => void;
}

/** The header of the card the view is inside, pinned with the fold its own toggle can't reach while scrolled away. */
const BandItem = ({ entry, inContext, onCollapse }: BandItemProps) => (
  <div className="bg-surface">
    <div className={cn(inContext && "ml-1.5 pl-3 border-l")}>
      <ElevatedSurface offset={1} className="border border-b-0 rounded-t-lg overflow-clip">
        <RoleHeader
          role={entry.role ?? "message"}
          action={
            <>
              {entry.label && (
                <span className="-ml-1 min-w-0 truncate text-sm text-muted-foreground">· {entry.label}</span>
              )}
              <button
                type="button"
                onClick={onCollapse}
                className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronUp className="size-3.5" />
                {entry.action}
              </button>
            </>
          }
        />
      </ElevatedSurface>
    </div>
  </div>
);

export default BandItem;
