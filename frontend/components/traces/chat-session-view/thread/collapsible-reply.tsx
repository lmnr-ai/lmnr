import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import ChatMarkdown from "./chat-markdown";

/** Assistant reply clipped to a fixed height with a "... more" toggle; markdown always renders whole. */
export default function CollapsibleReply({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className="flex flex-col">
      <div
        ref={ref}
        className={cn(
          !expanded && "max-h-[280px] overflow-hidden",
          !expanded && overflows && "[mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)]"
        )}
      >
        <ChatMarkdown text={text} />
      </div>
      {(overflows || expanded) && (
        <button
          className="w-fit text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "less" : "... more"}
        </button>
      )}
    </div>
  );
}
