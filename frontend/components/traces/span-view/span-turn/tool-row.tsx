import { Bolt, ChevronDown, ChevronRight, Lightbulb } from "lucide-react";
import { type PropsWithChildren, useCallback, useRef, useState } from "react";

import { useCollapsible } from "@/components/traces/span-view/collapsible";
import { getRoleTextColor } from "@/components/traces/span-view/common";
import { useExpandClamp } from "@/components/traces/span-view/height-clamp";

const TOOL_ICON = <Bolt size={14} className="min-w-3.5" style={{ color: getRoleTextColor("tool") }} />;

// Calls and results share the icon: the card's role says which one it is.
const ICONS = {
  call: TOOL_ICON,
  result: TOOL_ICON,
  reasoning: <Lightbulb size={14} className="min-w-3.5 text-muted-foreground" />,
};

interface ToolRowProps {
  icon: keyof typeof ICONS;
  name: string;
  summary: string;
  defaultOpen?: boolean;
  /** Holds search matches: kept open, since a collapsed row doesn't mount the editor that shows them. */
  hasMatches?: boolean;
}

/** A one-line, expandable tool call / tool result / reasoning row. */
const ToolRow = ({
  icon,
  name,
  summary,
  defaultOpen = false,
  hasMatches = false,
  children,
}: PropsWithChildren<ToolRowProps>) => {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = open || hasMatches;
  const rootRef = useRef<HTMLDivElement>(null);
  const collapse = useCallback(() => setOpen(false), []);
  const expandClamp = useExpandClamp();
  useCollapsible(rootRef, open && !hasMatches, name, "Collapse", collapse);

  return (
    <div ref={rootRef} className="flex flex-col">
      <button
        type="button"
        onClick={() => {
          if (!expanded) expandClamp();
          setOpen(!expanded);
        }}
        className="flex flex-col px-2.5 py-2 text-left text-xs hover:overlay-hover min-w-0"
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
      </button>
      {expanded && <div className="flex flex-col gap-2.5 px-2.5 pb-2.5">{children}</div>}
    </div>
  );
};

export default ToolRow;
