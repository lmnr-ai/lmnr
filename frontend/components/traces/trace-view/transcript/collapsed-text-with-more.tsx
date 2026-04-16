import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const MORE_TEXT = "... more";
const LESS_TEXT = "less";
const CHARS_PER_PIXEL = 0.155;
const FALLBACK_WIDTH = 500;

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
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(FALLBACK_WIDTH);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const charsPerLine = Math.floor(containerWidth * charsPerPixel);
  const maxChars = charsPerLine * maxLines - MORE_TEXT.length;
  const truncated = isExpanded ? null : truncateText(text, maxChars);
  const canCollapse = truncateText(text, maxChars) !== null;

  return (
    <div
      ref={containerRef}
      className={cn("text-sm text-secondary-foreground", className)}
      style={{ lineHeight: `${lineHeight}px` }}
    >
      {truncated !== null ? (
        <p>
          {truncated}
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
        <p>
          {text}
          {canCollapse && (
            <>
              {" "}
              <button
                className="text-muted-foreground hover:text-primary-foreground transition-colors cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
              >
                {LESS_TEXT}
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
