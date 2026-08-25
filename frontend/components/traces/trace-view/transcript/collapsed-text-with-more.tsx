import { useLayoutEffect, useRef, useState } from "react";

import Markdown from "@/components/traces/trace-view/transcript/markdown";
import { cn } from "@/lib/utils";

interface CollapsedTextWithMoreProps {
  text: string;
  lineHeight: number;
  maxLines?: number;
  className?: string;
}

export function CollapsedTextWithMore({ text, lineHeight, maxLines = 4, className }: CollapsedTextWithMoreProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Rendered markdown can lay out asynchronously (fonts, mermaid, etc.), so
  // re-measure on every content change rather than only once on mount.
  const collapsedMaxHeight = (lineHeight + 4) * maxLines;

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const measure = () => setIsOverflowing(el.scrollHeight > collapsedMaxHeight + 1);
    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [text, collapsedMaxHeight]);

  return (
    <div className={cn("text-[13px] text-secondary-foreground/95 break-words", className)}>
      <div
        ref={contentRef}
        className={cn(
          "overflow-hidden",
          !isExpanded && isOverflowing && "[mask-image:linear-gradient(to_bottom,black_calc(100%-16px),transparent)]"
        )}
        style={isExpanded ? undefined : { maxHeight: `${collapsedMaxHeight}px` }}
      >
        <Markdown output={text} className="text-secondary-foreground/95 [&_*]:!text-[13px]" contentClassName="pb-0" />
      </div>
      {(isOverflowing || isExpanded) && (
        <button
          className="text-muted-foreground hover:text-primary-foreground transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((v) => !v);
          }}
        >
          {isExpanded ? "less" : "... more"}
        </button>
      )}
    </div>
  );
}
