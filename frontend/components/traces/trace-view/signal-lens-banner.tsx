import { Diamond, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { cn } from "@/lib/utils";

interface SignalLensBannerProps {
  onChipClick: (spanId: string) => void;
}

export default function SignalLensBanner({ onChipClick }: SignalLensBannerProps) {
  const [isDismissing, setIsDismissing] = useState(false);

  const { signalLensActive, signalName, significantSpanIds, activeChipSpanId, spans, dismissSignalLens } =
    useTraceViewBaseStore((state) => ({
      signalLensActive: state.signalLensActive,
      signalName: state.signalName,
      significantSpanIds: state.significantSpanIds,
      activeChipSpanId: state.activeChipSpanId,
      spans: state.spans,
      dismissSignalLens: state.dismissSignalLens,
    }));

  const significantSpans = useMemo(() => {
    if (significantSpanIds.size === 0) return [];
    return spans.filter((s) => significantSpanIds.has(s.spanId));
  }, [spans, significantSpanIds]);

  const hasReferencedSpans = significantSpans.length > 0;

  const handleDismiss = useCallback(() => {
    setIsDismissing(true);
    // Wait for animation to complete before clearing state
    setTimeout(() => {
      dismissSignalLens();
      // Clean up signalEventId from URL
      const url = new URL(window.location.href);
      url.searchParams.delete("signalEventId");
      window.history.replaceState({}, "", url.toString());
    }, 250);
  }, [dismissSignalLens]);

  if (!signalLensActive) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 border-b flex-wrap",
        isDismissing && "signal-lens-banner-dismiss"
      )}
      style={{
        backgroundColor: "hsl(var(--info) / 0.1)",
        borderColor: "hsl(var(--info) / 0.3)",
        borderWidth: "0 0 0.5px 0",
      }}
    >
      {/* Signal icon */}
      <Diamond className="size-3.5 shrink-0" style={{ color: "hsl(var(--info))" }} />

      {/* Label */}
      <span className="text-xs font-medium whitespace-nowrap" style={{ color: "hsl(var(--info))" }}>
        {signalName ?? "Signal"}
        {hasReferencedSpans && (
          <span className="ml-1 font-normal opacity-80">
            — {significantSpans.length} significant span{significantSpans.length !== 1 ? "s" : ""}
          </span>
        )}
        {!hasReferencedSpans && (
          <span className="ml-1 font-normal opacity-80">— Referenced spans not found in this trace</span>
        )}
      </span>

      {hasReferencedSpans && (
        <>
          {/* Vertical separator */}
          <div className="h-4 shrink-0" style={{ width: "0.5px", backgroundColor: "hsl(var(--info) / 0.3)" }} />

          {/* Span chips */}
          <div className="flex items-center gap-1 flex-wrap">
            {significantSpans.map((span) => {
              const isActive = activeChipSpanId === span.spanId;
              return (
                <button
                  key={span.spanId}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[11px] transition-colors border",
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
                  onClick={() => onChipClick(span.spanId)}
                >
                  {span.name}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Dismiss button */}
      <button
        className="p-0.5 rounded-sm transition-colors shrink-0 hover:bg-white/10"
        style={{ color: "hsl(var(--info) / 0.6)" }}
        onClick={handleDismiss}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
