import { Bolt, ChevronDown, ChevronRight, Lightbulb } from "lucide-react";
import { type PropsWithChildren, type ReactNode, useCallback, useRef, useState } from "react";

import { useCollapsible } from "@/components/traces/span-view/collapsible";
import { getRoleTextColor } from "@/components/traces/span-view/common";
import { useExpandClamp } from "@/components/traces/span-view/height-clamp";
import { useSpanSearchState } from "@/components/traces/span-view/span-search-context";

const ICONS = {
  call: <Bolt size={14} className="min-w-3.5" style={{ color: getRoleTextColor("tool") }} />,
  result: null,
  reasoning: <Lightbulb size={14} className="min-w-3.5 text-muted-foreground" />,
};

interface ToolRowProps {
  icon: keyof typeof ICONS;
  name: string;
  summary: string;
  /** Second summary line, e.g. the paired result. */
  detail?: ReactNode;
  defaultOpen?: boolean;
}

/** A one-line, expandable tool call / tool result / reasoning row. */
const ToolRow = ({ icon, name, summary, detail, defaultOpen = false, children }: PropsWithChildren<ToolRowProps>) => {
  // Collapsed rows don't mount their editors, so they can't be searched.
  const searching = !!useSpanSearchState()?.searchTerm;
  const [open, setOpen] = useState(defaultOpen || searching);
  const expanded = open || searching;
  const rootRef = useRef<HTMLDivElement>(null);
  const collapse = useCallback(() => setOpen(false), []);
  const expandClamp = useExpandClamp();
  useCollapsible(rootRef, open && !searching, name, "Collapse", collapse);

  return (
    <div ref={rootRef} className="flex flex-col">
      <button
        type="button"
        onClick={() => {
          if (!expanded) expandClamp();
          setOpen(!expanded);
        }}
        className="flex flex-col gap-1 px-2.5 py-2 text-left text-xs hover:overlay-hover min-w-0"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          {ICONS[icon]}
          <span
            className="font-medium shrink-0"
            style={icon === "reasoning" ? undefined : { color: getRoleTextColor("tool") }}
          >
            {name}
          </span>
          {!expanded && <span className="truncate font-mono text-muted-foreground">{summary}</span>}
        </span>
        {!expanded && detail}
      </button>
      {expanded && <div className="flex flex-col gap-2.5 px-2.5 pb-2.5">{children}</div>}
    </div>
  );
};

export default ToolRow;
