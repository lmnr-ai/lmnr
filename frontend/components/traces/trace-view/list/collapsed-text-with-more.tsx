import { useState } from "react";

import { cn } from "@/lib/utils";

const MORE_TEXT = "... more";
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

  const charsPerLine = Math.floor(FALLBACK_WIDTH * charsPerPixel);
  const maxChars = charsPerLine * maxLines - MORE_TEXT.length;
  const truncated = isExpanded ? null : truncateText(text, maxChars);

  return (
    <div className={cn("text-sm text-secondary-foreground", className)} style={{ lineHeight: `${lineHeight}px` }}>
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
        <p>{text}</p>
      )}
    </div>
  );
}
