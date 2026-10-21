"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Same collapse as the transcript's CollapsedTextWithMore, but over MDX children.
const LINE_HEIGHT = 22; // text-sm leading-relaxed
const MAX_LINES = 4;
const COLLAPSED_MAX_HEIGHT = (LINE_HEIGHT + 4) * MAX_LINES;

export default function CollapsibleEventBody({ children, className }: { children: ReactNode; className?: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const measure = () => setIsOverflowing(el.scrollHeight > COLLAPSED_MAX_HEIGHT + 1);
    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className="flex flex-col items-start gap-1">
      <div
        ref={contentRef}
        className={cn(
          "w-full overflow-hidden",
          !isExpanded && isOverflowing && "[mask-image:linear-gradient(to_bottom,black_calc(100%-16px),transparent)]",
          className
        )}
        style={isExpanded ? undefined : { maxHeight: `${COLLAPSED_MAX_HEIGHT}px` }}
      >
        {children}
      </div>
      {(isOverflowing || isExpanded) && (
        <button
          className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground-100"
          onClick={() => setIsExpanded((v) => !v)}
        >
          {isExpanded ? "less" : "... more"}
        </button>
      )}
    </div>
  );
}
