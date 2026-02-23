import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React from "react";

import { type TraceViewListSpan, useTraceViewContext } from "@/components/traces/trace-view/store/base";
import { cn } from "@/lib/utils.ts";

import SpanTypeIcon from "../../span-type-icon.tsx";

interface MiniTreeProps {
  span: TraceViewListSpan;
}

export function MiniTree({ span }: MiniTreeProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathName = usePathname();

  const { getSpanBranch, getSpanNameInfo, selectSpanById } = useTraceViewContext((state) => ({
    getSpanBranch: state.getSpanBranch,
    getSpanNameInfo: state.getSpanNameInfo,
    selectSpanById: state.selectSpanById,
  }));

  const fullSpanBranch = getSpanBranch(span);

  const allSpans = fullSpanBranch.map((branchSpan) => ({
    spanId: branchSpan.spanId,
    name: branchSpan.name,
    spanType: branchSpan.spanType,
    isCurrent: branchSpan.spanId === span.spanId,
  }));

  const ROW_HEIGHT = 22;
  const DEPTH_INDENT = 24;

  const handleSpanClick = (spanId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    selectSpanById(spanId);

    const params = new URLSearchParams(searchParams);
    params.set("spanId", spanId);
    router.push(`${pathName}?${params.toString()}`);
  };

  return (
    <div className="flex flex-col min-w-[180px] max-w-[400px]">
      {allSpans.map((span, index) => {
        const spanInfo = getSpanNameInfo(span.spanId) || { name: span.name };
        const displayName = spanInfo.name;
        const count = spanInfo.count;
        const depth = index;

        return (
          <div
            key={span.spanId}
            className="flex items-center gap-0 relative"
            style={{ height: ROW_HEIGHT, paddingLeft: depth * DEPTH_INDENT }}
          >
            {/* Tree connector - L-shaped line */}
            {depth > 0 && (
              <div
                className="border-l border-b border-border rounded-bl absolute"
                style={{
                  height: ROW_HEIGHT / 2,
                  width: 10,
                  top: 2,
                  left: (depth - 1) * DEPTH_INDENT + 15,
                }}
              />
            )}

            {/* Vertical line for parent continuation */}
            {depth > 0 &&
              Array.from({ length: depth - 1 }).map((_, i) => (
                <div
                  key={i}
                  className="border-l border-border/20 absolute"
                  style={{
                    height: ROW_HEIGHT,
                    left: i * DEPTH_INDENT + 1,
                    top: 0,
                  }}
                />
              ))}

            {/* Span info */}
            <div
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] flex-1 min-w-0 cursor-pointer hover:underline",
                span.isCurrent ? "font-medium" : "text-secondary-foreground"
              )}
              onClick={handleSpanClick(span.spanId)}
            >
              <SpanTypeIcon
                containerWidth={18}
                containerHeight={18}
                spanType={span.spanType}
                iconClassName="size-3.5"
                className="flex-shrink-0"
              />
              <span className="truncate" title={displayName}>
                {displayName}
              </span>
              {count && (
                <span className="text-secondary-foreground px-1.5 py-0.5 bg-muted rounded text-[10px] font-medium flex-shrink-0">
                  {count}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
