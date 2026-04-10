import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const MORE_TEXT = "... more";

// Average chars per pixel for 13px Inter (normal weight).
// Inter at 13px averages ~6.2px per character. Inverse ≈ 0.161 chars/px.
// Slightly conservative to avoid overshooting 4 lines.
const CHARS_PER_PIXEL = 0.155;

interface CollapsedTextWithMoreProps {
  text: string;
  lineHeight: number;
  maxLines?: number;
  charsPerPixel?: number;
  className?: string;
}

function truncateText(text: string, maxChars: number): string | null {
  if (text.length <= maxChars) return null;

  const cutRegion = text.slice(0, maxChars);
  const lastSpace = cutRegion.lastIndexOf(" ");
  if (lastSpace <= 0) return cutRegion.trimEnd();
  return cutRegion.slice(0, lastSpace);
}

export function CollapsedTextWithMore({
  text,
  lineHeight,
  maxLines = 4,
  charsPerPixel = CHARS_PER_PIXEL,
  className,
}: CollapsedTextWithMoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [truncatedText, setTruncatedText] = useState<string | null>(null);

  const recalculate = useCallback(() => {
    if (isExpanded) return;
    const el = containerRef.current;
    if (!el) return;
    const width = el.clientWidth;
    if (width === 0) return;

    const charsPerLine = Math.floor(width * charsPerPixel);
    const maxChars = charsPerLine * maxLines - MORE_TEXT.length;
    setTruncatedText(truncateText(text, maxChars));
  }, [text, charsPerPixel, maxLines, isExpanded]);

  useLayoutEffect(() => {
    recalculate();
  }, [recalculate]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || isExpanded) return;
    const observer = new ResizeObserver(recalculate);
    observer.observe(el);
    return () => observer.disconnect();
  }, [recalculate, isExpanded]);

  const needsTruncation = truncatedText !== null && !isExpanded;

  return (
    <div
      ref={containerRef}
      className={cn("text-[13px] text-secondary-foreground", className)}
      style={{ lineHeight: `${lineHeight}px` }}
    >
      {needsTruncation ? (
        <p>
          {truncatedText}
          <button
            className="text-muted-foreground hover:text-primary-foreground transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(true);
            }}
          >
            {MORE_TEXT}
          </button>
        </p>
      ) : (
        <p>{text}</p>
      )}
    </div>
  );
}
