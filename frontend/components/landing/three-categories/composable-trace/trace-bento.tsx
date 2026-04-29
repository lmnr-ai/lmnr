"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";
import { CirclePlay } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";

import Header from "@/components/shared/traces/header";
import SessionPlayer from "@/components/shared/traces/session-player";
import { SpanView } from "@/components/shared/traces/span-view";
import { TraceStatsShields } from "@/components/traces/stats-shields";
import CondensedTimeline from "@/components/traces/trace-view/condensed-timeline";
import { type TraceViewSpan, type TraceViewTrace, useTraceViewStore } from "@/components/traces/trace-view/store";
import Transcript from "@/components/traces/trace-view/transcript";
import Tree from "@/components/traces/trace-view/tree";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import ViewDropdown from "@/components/traces/trace-view/view-dropdown";
import { Button } from "@/components/ui/button";
import { SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import TraceSection from "./trace-section";

interface Props {
  progress: MotionValue<number>;
  trace?: TraceViewTrace;
  spans: TraceViewSpan[];
  initialSpanId?: string;
}

const noop = () => {};

const TraceBento = ({ progress, trace, spans, initialSpanId }: Props) => {
  const {
    setSpans,
    setTrace,
    setSelectedSpan,
    setHasBrowserSession,
    setBrowserSession,
    selectedSpan,
    tab,
    browserSession,
    hasBrowserSession,
  } = useTraceViewStore(
    (state) => ({
      setSpans: state.setSpans,
      setTrace: state.setTrace,
      setSelectedSpan: state.setSelectedSpan,
      setHasBrowserSession: state.setHasBrowserSession,
      setBrowserSession: state.setBrowserSession,
      selectedSpan: state.selectedSpan,
      tab: state.tab,
      browserSession: state.browserSession,
      hasBrowserSession: state.hasBrowserSession,
    }),
    shallow
  );

  useEffect(() => {
    if (!trace || spans.length === 0) return;
    setSpans(enrichSpansWithPending(spans));
    setTrace(trace);
    const target = (initialSpanId && spans.find((s) => s.spanId === initialSpanId)) || spans[0];
    setSelectedSpan({ ...target, collapsed: false });
    if (trace.hasBrowserSession) {
      setHasBrowserSession(true);
      setBrowserSession(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace?.id, spans.length]);

  const handleSpanSelect = useCallback((span?: TraceViewSpan) => setSelectedSpan(span), [setSelectedSpan]);

  const llmSpanIds = useMemo(() => spans.filter((s) => s.spanType === SpanType.LLM).map((s) => s.spanId), [spans]);

  const outerOpacity = useTransform(progress, [0, 1], [0, 1]);
  const outlineColor = useTransform(outerOpacity, (v) => `rgba(37, 37, 38, ${v})`);

  return (
    <div className="relative w-full h-[765px] p-8">
      <motion.div
        style={{ opacity: outerOpacity }}
        className="absolute inset-0 rounded-lg bg-landing-surface-600 border border-landing-surface-500 pointer-events-none"
      />

      <motion.div
        style={{ opacity: outerOpacity }}
        className="absolute w-full bottom-0 h-[200px] pointer-events-none z-20 bg-gradient-to-t from-landing-surface-600 to-transparent left-0"
      />

      <motion.div style={{ outlineColor }} className="flex w-full h-full relative z-10 outline rounded-lg">
        <div className="flex flex-col flex-1 min-w-0 h-full">
          <TraceSection
            label="Timeline"
            progress={progress}
            fromX={-12}
            fromY={-12}
            keepCorners={{ tl: true }}
            className="w-full h-[200px] shrink-0"
          >
            <div className="flex flex-col w-full h-full bg-background overflow-hidden">
              <Header onClose={noop} isHideTimelineControls />
              <div className="flex-1 min-h-0">
                <CondensedTimeline />
              </div>
            </div>
          </TraceSection>

          <TraceSection
            label="Transcript"
            progress={progress}
            fromX={-12}
            fromY={12}
            keepCorners={{ bl: true }}
            className="w-full flex-1 min-h-0"
          >
            <div className="flex flex-col w-full h-full bg-background overflow-hidden">
              <div className={cn("flex items-center gap-2 px-2 pt-2 pb-2 border-b box-border")}>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <ViewDropdown isDisableHint />
                    {trace && <TraceStatsShields className="min-w-0 overflow-hidden" trace={trace} />}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      className={cn("h-6 px-1.5 text-xs", { "border-primary text-primary": browserSession })}
                      variant="outline"
                      onClick={() => setBrowserSession(!browserSession)}
                      disabled={!hasBrowserSession}
                    >
                      <CirclePlay size={14} className="mr-1" />
                      Media
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex flex-1 h-full overflow-hidden relative">
                {tab === "tree" ? (
                  <Tree onSpanSelect={handleSpanSelect} isShared />
                ) : (
                  <Transcript onSpanSelect={handleSpanSelect} isShared />
                )}
              </div>
              {browserSession && trace && (
                <div className="border-t shrink-0 h-[180px]">
                  <SessionPlayer
                    onClose={() => setBrowserSession(false)}
                    hasBrowserSession={hasBrowserSession}
                    traceId={trace.id}
                    llmSpanIds={llmSpanIds}
                  />
                </div>
              )}
            </div>
          </TraceSection>
        </div>

        <TraceSection
          label="Selected span"
          progress={progress}
          fromX={12}
          fromY={-12}
          keepCorners={{ tr: true, br: true }}
          className="w-[526px] h-full shrink-0"
        >
          <div className="w-full h-full bg-background overflow-hidden">
            {selectedSpan && trace ? (
              <SpanView key={selectedSpan.spanId} spanId={selectedSpan.spanId} traceId={trace.id} />
            ) : (
              <div className="flex items-center justify-center w-full h-full text-muted-foreground text-sm">
                Loading…
              </div>
            )}
          </div>
        </TraceSection>
      </motion.div>
    </div>
  );
};

export default TraceBento;
