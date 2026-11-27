import { ChevronUp } from "lucide-react";

import { type CollapsibleEntry } from "@/components/traces/span-view/collapsible";
import { RoleTab } from "@/components/traces/span-view/common";

interface BandItemProps {
  entry: CollapsibleEntry;
  onCollapse: () => void;
}

/** The header of the card the view is inside, pinned with the fold its own toggle can't reach while scrolled away. */
const BandItem = ({ entry, onCollapse }: BandItemProps) => (
  <RoleTab
    role={entry.role ?? "message"}
    action={
      <>
        {entry.label && <span className="-ml-1 min-w-0 truncate text-sm text-muted-foreground">· {entry.label}</span>}
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
);

export default BandItem;
