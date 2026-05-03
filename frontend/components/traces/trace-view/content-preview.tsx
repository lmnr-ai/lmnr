import { ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import Markdown from "./transcript/markdown";

interface ContentPreviewProps {
  output: any;
  maxHeight?: string;
  expandable?: boolean;
  scrollable?: boolean;
  className?: string;
}

export function ContentPreview({
  output,
  maxHeight = "max-h-48",
  expandable = false,
  scrollable = false,
  className,
}: ContentPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const overflows = el.scrollHeight > el.clientHeight + 1;
    setIsOverflowing(overflows);

    if (scrollable) {
      setCanScrollUp(el.scrollTop > 0);
      setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    }
  }, [scrollable]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateScrollState();

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    Array.from(el.children).forEach((child) => resizeObserver.observe(child));

    if (scrollable) {
      el.addEventListener("scroll", updateScrollState);
    }

    return () => {
      resizeObserver.disconnect();
      if (scrollable) {
        el.removeEventListener("scroll", updateScrollState);
      }
    };
  }, [updateScrollState, scrollable, isExpanded, output]);

  const maskImage = useMemo(() => {
    if (scrollable) {
      if (canScrollUp && canScrollDown) {
        return "linear-gradient(to bottom, transparent, black 24px, black calc(100% - 30px), transparent)";
      } else if (canScrollUp) {
        return "linear-gradient(to bottom, transparent, black 30px)";
      } else if (canScrollDown) {
        return "linear-gradient(to bottom, black calc(100% - 60px), transparent)";
      }
    } else if (!isExpanded && isOverflowing) {
      return "linear-gradient(to bottom, black calc(100% - 40px), transparent)";
    }
    return undefined;
  }, [scrollable, canScrollUp, canScrollDown, isExpanded, isOverflowing]);

  const showToggle = expandable && (isOverflowing || isExpanded);

  return (
    <div className={cn("relative", expandable && isExpanded && "pb-2", className)}>
      <div
        ref={containerRef}
        className={cn(scrollable ? "overflow-auto styled-scrollbar" : "overflow-hidden", !isExpanded && maxHeight)}
        style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
      >
        <Markdown output={output} />
      </div>
      {showToggle && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((prev) => !prev);
          }}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 bottom-0 flex items-center gap-1 px-1 pt-4 pb-0.5 rounded-full w-full justify-center",
            "text-xs text-foreground",
            "transition-colors cursor-pointer z-10"
          )}
        >
          {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      )}
    </div>
  );
}
