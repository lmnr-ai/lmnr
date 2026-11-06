import { ChevronDown, ChevronRight } from "lucide-react";
import { type PropsWithChildren, useCallback, useRef, useState } from "react";

import { useCollapsible } from "@/components/traces/span-view/collapsible";
import { getRoleTextColor } from "@/components/traces/span-view/common";
import { useExpandClamp } from "@/components/traces/span-view/height-clamp";
import { useSpanSearchState } from "@/components/traces/span-view/span-search-context";
import { preview, type ToolResultPart } from "@/lib/spans/turn-parts";

// Enough for the clamped lines; never render the full payload while collapsed.
const PREVIEW_CHARS = 800;

/** A tool result shown as content: tool + arguments, then the first lines of output; click for the full value. */
const ResultPreview = ({ part, children }: PropsWithChildren<{ part: ToolResultPart }>) => {
  const searching = !!useSpanSearchState()?.searchTerm;
  const [open, setOpen] = useState(searching);
  const expanded = open || searching;
  const name = part.name ?? part.id ?? "result";
  const rootRef = useRef<HTMLDivElement>(null);
  const collapse = useCallback(() => setOpen(false), []);
  const expandClamp = useExpandClamp();
  useCollapsible(rootRef, open && !searching, name, "Collapse", collapse);
  const text = typeof part.output === "string" ? part.output.slice(0, PREVIEW_CHARS) : preview(part.output);

  // One target: collapsed, header and preview are a single button; expanded, only the header collapses it.
  return (
    <div ref={rootRef} className="flex flex-col">
      <button
        type="button"
        onClick={() => {
          if (!expanded) expandClamp();
          setOpen(!expanded);
        }}
        className="flex flex-col gap-2 px-2.5 py-2 min-w-0 text-left text-xs hover:overlay-hover"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium shrink-0" style={{ color: getRoleTextColor("tool") }}>
            {name}
          </span>
          {part.call && <span className="truncate font-mono text-muted-foreground">{preview(part.call.args)}</span>}
        </span>
        {!expanded && (
          <span className="block ml-[7px] border-l-2 pl-4 py-0.5">
            <span className="block font-mono text-xs whitespace-pre-wrap break-words line-clamp-4 text-secondary-foreground">
              {text || "(empty)"}
            </span>
          </span>
        )}
      </button>
      {expanded && <div className="flex flex-col gap-2.5 px-2.5 pb-2">{children}</div>}
    </div>
  );
};

export default ResultPreview;
