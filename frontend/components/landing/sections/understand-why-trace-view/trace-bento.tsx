"use client";

import { motion, type Transition } from "framer-motion";
import { CirclePlay } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import Header from "@/components/shared/traces/header";
import SessionPlayer from "@/components/shared/traces/session-player";
import { SpanView } from "@/components/shared/traces/span-view";
import { TraceStatsShields } from "@/components/traces/stats-shields";
import CondensedTimeline from "@/components/traces/trace-view/condensed-timeline";
import { type TraceViewSpan, type TraceViewTrace, useTraceViewStore } from "@/components/traces/trace-view/store";
import Transcript from "@/components/traces/trace-view/transcript";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import ViewDropdown from "@/components/traces/trace-view/view-dropdown";
import { Button } from "@/components/ui/button";
import { SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import AskAi from "./ask-ai";
import { type Stage } from "./stage-text";

interface Props {
  stage: Stage;
  trace?: TraceViewTrace;
  spans: TraceViewSpan[];
}

const TWEEN: Transition = { type: "tween", duration: 0.3, ease: "easeInOut" };

// Sum of inner heights — header+condensed-timeline (160) + toolbar (41 incl. border-b).
const TIMELINE_SECTION_HEIGHT = 201;
const RECORDING_SECTION_HEIGHT = 240;

const noop = () => {};

// Wrapper-vs-content animation pattern: each panel wrapper animates its outer
// dimension (width or height); the inner content has a fixed pixel size so
// text never reflows during animation. Borders live on inner content (not on
// the animating wrapper) so collapsed wrappers don't draw 1px artifacts.
const TraceBento = ({ stage, trace, spans }: Props) => {
  const { setSpans, setTrace, setSelectedSpan, setHasBrowserSession, setBrowserSession, selectedSpan, browserSession } =
    useTraceViewStore(
      (state) => ({
        setSpans: state.setSpans,
        setTrace: state.setTrace,
        setSelectedSpan: state.setSelectedSpan,
        setHasBrowserSession: state.setHasBrowserSession,
        setBrowserSession: state.setBrowserSession,
        selectedSpan: state.selectedSpan,
        browserSession: state.browserSession,
      }),
      shallow
    );

  useEffect(() => {
    if (!trace || spans.length === 0) return;
    setSpans(enrichSpansWithPending(spans));
    setTrace(trace);
    if (trace.hasBrowserSession) setHasBrowserSession(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace?.id, spans.length]);

  // Browser session follows the stage — opens at stage 3+, closes when scrolled back.
  useEffect(() => {
    setBrowserSession(stage >= 3);
  }, [stage, setBrowserSession]);

  const llmSpanIds = useMemo(() => spans.filter((s) => s.spanType === SpanType.LLM).map((s) => s.spanId), [spans]);

  // Span clicks during the scroll animation are ignored — selection only takes
  // effect once we've reached the final stage. Stage stored in a ref so the
  // callback identity doesn't change with stage.
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
    // Scrolling back out of stage 4 dismisses the span panel so it doesn't
    // re-appear mid-transition on the way down.
    if (stage < 4 && selectedSpan) setSelectedSpan(undefined);
  }, [stage, selectedSpan, setSelectedSpan]);

  const handleSpanSelect = useCallback(
    (span?: TraceViewSpan) => {
      if (stageRef.current !== 4) return;
      setSelectedSpan(span);
    },
    [setSelectedSpan]
  );
  const handleCloseSpan = useCallback(() => setSelectedSpan(undefined), [setSelectedSpan]);

  const isShowSpanView = stage === 4 && !!selectedSpan && !!trace;

  return (
    <div
      className={cn(
        "flex flex-row rounded-md overflow-hidden h-[680px] bg-background border border-landing-surface-500 mx-auto",
        stage !== 4 && "pointer-events-none"
      )}
    >
      {/* LEFT COLUMN: timeline+toolbar + transcript + recording */}
      <div className="flex flex-col w-[400px] h-full shrink-0">
        {/* Timeline section wrapper animates height; borders live on inner so a
            collapsed wrapper draws nothing. */}
        <motion.div
          animate={{ height: stage >= 2 ? TIMELINE_SECTION_HEIGHT : 0 }}
          transition={TWEEN}
          className="overflow-hidden shrink-0"
        >
          <div className="w-full flex flex-col" style={{ height: TIMELINE_SECTION_HEIGHT }}>
            <div className="h-[160px] shrink-0 flex flex-col border-b">
              <Header onClose={noop} isHideTimelineControls />
              <div className="flex-1 min-h-0">
                <CondensedTimeline />
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2 px-2 py-2 border-b box-border">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <ViewDropdown isDisableHint />
                  {trace && <TraceStatsShields className="min-w-0 overflow-hidden" trace={trace} />}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    disabled={!trace}
                    className={cn("h-6 px-1.5 text-xs overflow-hidden", {
                      "border-primary text-primary": browserSession,
                    })}
                    variant="outline"
                    onClick={() => setBrowserSession(!browserSession)}
                  >
                    <CirclePlay size={14} className="flex-shrink-0" />
                    <span className="ml-1 truncate">Media</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Transcript fills remaining vertical space inside the left column. */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Transcript onSpanSelect={handleSpanSelect} isShared />
        </div>

        {/* Recording wrapper animates height; inner is fixed 240px with
            border-t on inner so it appears as wrapper opens (not as a 1px
            stripe when collapsed). */}
        <motion.div
          animate={{ height: stage >= 3 ? RECORDING_SECTION_HEIGHT : 0 }}
          transition={TWEEN}
          className="overflow-hidden shrink-0"
        >
          <div className="w-full border-t" style={{ height: RECORDING_SECTION_HEIGHT }}>
            {trace && (
              <SessionPlayer
                onClose={noop}
                hasBrowserSession={!!trace.hasBrowserSession}
                traceId={trace.id}
                llmSpanIds={llmSpanIds}
              />
            )}
          </div>
        </motion.div>
      </div>

      {/* MIDDLE COLUMN: span view. Only opens when the user clicks a span
          inside the transcript and we're at stage 4. Closing clears the
          selection so the wrapper collapses back to 0. */}
      <motion.div
        animate={{ width: isShowSpanView ? 360 : 0 }}
        transition={TWEEN}
        className="overflow-hidden h-full shrink-0"
      >
        <div className="w-[360px] h-full bg-background border-l">
          {isShowSpanView && (
            <SpanView
              key={selectedSpan!.spanId}
              spanId={selectedSpan!.spanId}
              traceId={trace!.id}
              onClose={handleCloseSpan}
            />
          )}
        </div>
      </motion.div>

      {/* RIGHT COLUMN: chat-with-trace, expands at stage 4. border-l on inner
          so a collapsed wrapper doesn't draw a 1px stripe on the right side
          of the left column. */}
      <motion.div
        animate={{ width: stage >= 4 ? 360 : 0 }}
        transition={TWEEN}
        className="overflow-hidden h-full shrink-0"
      >
        <div className="w-[360px] h-full bg-background border-l">
          <AskAi />
        </div>
      </motion.div>
    </div>
  );
};

export default TraceBento;
