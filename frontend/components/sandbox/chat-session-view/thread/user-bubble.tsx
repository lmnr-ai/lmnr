import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { formatClock } from "../format";

export default function UserBubble({ text, time }: { text: string; time: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-emphasis-0.5 px-3.5 py-2">
        <div ref={ref} className={cn("text-xs leading-5 whitespace-pre-wrap break-words", !expanded && "line-clamp-6")}>
          {text}
        </div>
        {(overflowing || expanded) && (
          <button
            className="mt-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
      <span className="pr-1 text-[11px] text-muted-foreground">{formatClock(time)}</span>
    </div>
  );
}
