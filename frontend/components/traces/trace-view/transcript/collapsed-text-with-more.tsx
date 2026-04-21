import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface CollapsedTextWithMoreProps {
  text: string;
  lineHeight: number;
  maxLines?: number;
  className?: string;
}

const LINE_CLAMP_CLASS: Record<number, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
};

export function CollapsedTextWithMore({ text, lineHeight, maxLines = 4, className }: CollapsedTextWithMoreProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const measuredRef = useRef(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    if (measuredRef.current) return;
    const el = textRef.current;
    if (!el) return;
    setIsOverflowing(el.scrollHeight > el.clientHeight + 1);
    measuredRef.current = true;
  }, []);

  const clampClass = LINE_CLAMP_CLASS[maxLines] ?? LINE_CLAMP_CLASS[4];

  return (
    <div
      className={cn("text-sm text-secondary-foreground/95 whitespace-pre-wrap break-words", className)}
      style={{ lineHeight: `${lineHeight + 4}px` }}
    >
      <p ref={textRef} className={isExpanded ? undefined : clampClass}>
        {text}
      </p>
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
