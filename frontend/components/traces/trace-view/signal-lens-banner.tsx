import { Diamond, X } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";

import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { cn } from "@/lib/utils";

// Regex to match Laminar trace URLs containing spanId query params
const SPAN_URL_PATTERN =
  /(https?:\/\/[^\s)>\]]+[?&]spanId=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[^\s)>\]]*)/gi;

interface SignalLensBannerProps {
  onChipClick: (spanId: string) => void;
  onDismiss: () => void;
}

/**
 * Render a payload string value, replacing Laminar trace URLs with clickable span chips.
 * Non-URL text is rendered as markdown via Streamdown.
 */
function PayloadValue({
  value,
  spans,
  activeChipSpanId,
  onChipClick,
}: {
  value: string;
  spans: { spanId: string; name: string }[];
  activeChipSpanId: string | null;
  onChipClick: (spanId: string) => void;
}) {
  const spanMap = useMemo(() => new Map(spans.map((s) => [s.spanId, s])), [spans]);

  const parts = useMemo(() => {
    const result: { type: "text"; content: string }[] | { type: "chip"; spanId: string; spanName: string }[] = [];
    let lastIndex = 0;
    // Reset regex lastIndex for fresh exec
    const regex = new RegExp(SPAN_URL_PATTERN.source, "gi");
    let match;
    while ((match = regex.exec(value)) !== null) {
      if (match.index > lastIndex) {
        (result as any[]).push({ type: "text", content: value.slice(lastIndex, match.index) });
      }
      const spanId = match[2];
      const span = spanMap.get(spanId);
      (result as any[]).push({
        type: "chip",
        spanId,
        spanName: span?.name ?? spanId.slice(0, 8),
      });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) {
      (result as any[]).push({ type: "text", content: value.slice(lastIndex) });
    }
    return result as ({ type: "text"; content: string } | { type: "chip"; spanId: string; spanName: string })[];
  }, [value, spanMap]);

  // If no URLs found, render the whole string as markdown
  const hasChips = parts.some((p) => p.type === "chip");
  if (!hasChips) {
    return (
      <Streamdown
        mode="static"
        parseIncompleteMarkdown={false}
        isAnimating={false}
        className="rounded text-wrap inline"
        rehypePlugins={[defaultRehypePlugins.harden]}
        components={{
          p: ({ children, className, ...props }) => (
            <span {...props} className={cn(className, "text-xs")}>
              {children}
            </span>
          ),
          a: ({ children, className, href, ...props }) => (
            <a
              {...props}
              href={href}
              className={cn(className, "text-xs underline")}
              style={{ color: "hsl(var(--info))" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {value}
      </Streamdown>
    );
  }

  return (
    <span className="inline">
      {parts.map((part, i) => {
        if (part.type === "text") {
          return (
            <Streamdown
              key={i}
              mode="static"
              parseIncompleteMarkdown={false}
              isAnimating={false}
              className="rounded text-wrap inline"
              rehypePlugins={[defaultRehypePlugins.harden]}
              components={{
                p: ({ children, className, ...props }) => (
                  <span {...props} className={cn(className, "text-xs")}>
                    {children}
                  </span>
                ),
              }}
            >
              {part.content}
            </Streamdown>
          );
        }
        const isActive = activeChipSpanId === part.spanId;
        return (
          <button
            key={i}
            className={cn(
              "px-2 py-0.5 rounded-full text-[11px] transition-colors border inline-flex items-center align-baseline mx-0.5",
              isActive ? "text-white" : "hover:brightness-110"
            )}
            style={
              isActive
                ? {
                    backgroundColor: "hsl(var(--info))",
                    borderColor: "hsl(var(--info))",
                  }
                : {
                    backgroundColor: "hsl(var(--info) / 0.15)",
                    borderColor: "hsl(var(--info) / 0.3)",
                    color: "hsl(var(--info))",
                  }
            }
            onClick={() => onChipClick(part.spanId)}
          >
            {part.spanName}
          </button>
        );
      })}
    </span>
  );
}

/** Format a payload value for display */
function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

export default function SignalLensBanner({ onChipClick, onDismiss }: SignalLensBannerProps) {
  const [isDismissing, setIsDismissing] = useState(false);

  const {
    signalLensActive,
    signalName,
    signalPayload,
    significantSpanIds,
    activeChipSpanId,
    spans,
    dismissSignalLens,
  } = useTraceViewBaseStore((state) => ({
    signalLensActive: state.signalLensActive,
    signalName: state.signalName,
    signalPayload: state.signalPayload,
    significantSpanIds: state.significantSpanIds,
    activeChipSpanId: state.activeChipSpanId,
    spans: state.spans,
    dismissSignalLens: state.dismissSignalLens,
  }));

  const significantSpans = useMemo(() => {
    if (significantSpanIds.size === 0) return [];
    return spans.filter((s) => significantSpanIds.has(s.spanId));
  }, [spans, significantSpanIds]);

  const payloadEntries = useMemo(() => {
    if (!signalPayload) return [];
    return Object.entries(signalPayload)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([key, value]) => ({ key, value: formatValue(value) }));
  }, [signalPayload]);

  const handleDismiss = useCallback(() => {
    setIsDismissing(true);
    setTimeout(() => {
      dismissSignalLens();
      onDismiss();
    }, 250);
  }, [dismissSignalLens, onDismiss]);

  if (!signalLensActive) return null;

  return (
    <div
      className={cn("flex flex-col border-b", isDismissing && "signal-lens-banner-dismiss")}
      style={{
        backgroundColor: "hsl(var(--info) / 0.06)",
        borderColor: "hsl(var(--info) / 0.3)",
        borderWidth: "0 0 0.5px 0",
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Diamond className="size-3.5 shrink-0" style={{ color: "hsl(var(--info))" }} />
        <span className="text-xs font-medium" style={{ color: "hsl(var(--info))" }}>
          {signalName ?? "Signal"}
        </span>
        <div className="flex-1" />
        <button
          className="p-0.5 rounded-sm transition-colors shrink-0 hover:bg-white/10"
          style={{ color: "hsl(var(--info) / 0.6)" }}
          onClick={handleDismiss}
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Payload rendered by keys */}
      {payloadEntries.length > 0 && (
        <div className="flex flex-col gap-1 px-3 pb-2">
          {payloadEntries.map(({ key, value }) => (
            <div key={key} className="flex gap-2 items-baseline min-w-0">
              <span className="text-[11px] font-medium shrink-0 opacity-60" style={{ color: "hsl(var(--info))" }}>
                {key}:
              </span>
              <div className="text-xs text-secondary-foreground min-w-0 flex-1">
                <PayloadValue
                  value={value}
                  spans={significantSpans}
                  activeChipSpanId={activeChipSpanId}
                  onChipClick={onChipClick}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
