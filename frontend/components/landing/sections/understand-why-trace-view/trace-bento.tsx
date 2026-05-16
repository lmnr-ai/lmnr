"use client";

import { motion, type MotionValue, type Transition } from "framer-motion";
import { ChevronDown, ChevronsRight, CirclePlay, Maximize, Radio, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

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

import SlackToSignalMorph from "../slack-to-signal-morph";
import AskAi from "./ask-ai";
import { type Stage } from "./stage-text";

interface Props {
  stage: Stage;
  /** 0 = pure slack, 1 = pure signal. Drives the morph card during stages 1↔2. */
  morphProgress: MotionValue<number>;
  trace?: TraceViewTrace;
  spans: TraceViewSpan[];
  /** Fires when the trace view's three-panel state changes (true once the
   *  user has clicked a span at stage 5 so Trace + Span + AskAi are all open). */
  onAllPanelsOpenChange?: (open: boolean) => void;
}

const TWEEN: Transition = { type: "tween", duration: 0.3, ease: "easeInOut" };

// Bento animates height between its natural content size at stages 1-2
// (measured via ResizeObserver on the header, since the morph card's own
// height changes during the slack→signal tween) and a fixed 680 at stage 3+.
// Framer can't tween between `auto` and a number, so we keep both endpoints
// numeric — the natural side comes from the measurement, the expanded side
// from the constant.
const BENTO_HEIGHT = 680;
const ROW1_HEIGHT = 28;
const TOOLBAR_HEIGHT = 36;
const TIMELINE_HEIGHT = 120;
const RECORDING_HEIGHT = 240;
const SIGNAL_CARD_MAX = 320;

const noop = () => {};

const HEADER_ITEM_CLS = "flex items-center h-7";

// Just row 1 of the production trace view header: close, maximize, "Trace" +
// dropdown, Chat, Signals. We omit metadata, tags, share, row 2 (session/user
// pills), search, and timeline-toggle controls per landing-page simplification.
// Most buttons are decorative (disabled + disabled:opacity-100); Signals is
// live and toggles the signal card via the store.
const TraceViewHeaderRow1 = ({
  signalsActive,
  chatActive,
  onSignalsToggle,
}: {
  signalsActive: boolean;
  chatActive: boolean;
  onSignalsToggle: () => void;
}) => (
  <div className="flex items-center gap-1">
    <span className={cn(HEADER_ITEM_CLS, "gap-0.5")}>
      <Button variant="ghost" disabled className="h-7 px-0.5 disabled:opacity-100">
        <ChevronsRight className="w-5 h-5" />
      </Button>
      <Button variant="ghost" disabled className="h-7 px-0.5 disabled:opacity-100">
        <Maximize className="w-4 h-4" />
      </Button>
    </span>

    <span className={HEADER_ITEM_CLS}>
      <span className="text-base font-medium pl-2 flex-shrink-0">Trace</span>
      <Button variant="ghost" disabled className="h-7 px-1 disabled:opacity-100">
        <ChevronDown className="w-3 h-3" />
      </Button>
    </span>

    <span className={HEADER_ITEM_CLS}>
      <Button
        variant="outline"
        disabled
        className={cn("h-6 text-xs px-1.5 disabled:opacity-100", chatActive && "border-primary text-primary")}
      >
        <Sparkles size={14} className="mr-1" />
        Chat
      </Button>
    </span>

    <span className={HEADER_ITEM_CLS}>
      <Button
        variant="outline"
        onClick={onSignalsToggle}
        className={cn("h-6 text-xs px-1.5", signalsActive && "border-primary text-primary")}
      >
        <Radio size={14} className="mr-1" />
        Signals (1)
      </Button>
    </span>
  </div>
);

// Bento outer + per-section animations.
//
// Layout matches production trace view + transcript panel:
//   ┌─────────────────────────────────┐
//   │ TraceViewHeader                 │  row 1 + signal card (inside header)
//   ├─────────────────────────────────┤
//   │ CondensedTimeline               │  stage 4+
//   ├─────────────────────────────────┤
//   │ Transcript Panel Header         │  ViewDropdown + Stats + Media (stage 3+)
//   ├─────────────────────────────────┤
//   │ Transcript (flex-1)             │
//   ├─────────────────────────────────┤
//   │ Recording                       │  store browserSession — user toggle only
//   └─────────────────────────────────┘
//
// The bento outer is fixed at 600px once the trace view materializes at
// stage 3. Per-section motion.divs animate height into the 600 budget; the
// transcript is flex-1 and absorbs whatever's left.
const TraceBento = ({ stage, morphProgress, trace, spans, onAllPanelsOpenChange }: Props) => {
  const {
    setSpans,
    setTrace,
    setSelectedSpan,
    setHasBrowserSession,
    setBrowserSession,
    selectedSpan,
    browserSession,
    signalsPanelOpen,
    setSignalsPanelOpen,
  } = useTraceViewStore(
    (state) => ({
      setSpans: state.setSpans,
      setTrace: state.setTrace,
      setSelectedSpan: state.setSelectedSpan,
      setHasBrowserSession: state.setHasBrowserSession,
      setBrowserSession: state.setBrowserSession,
      selectedSpan: state.selectedSpan,
      browserSession: state.browserSession,
      signalsPanelOpen: state.signalsPanelOpen,
      setSignalsPanelOpen: state.setSignalsPanelOpen,
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

  // Stage transitions set the *default* visibility of the signal card. The
  // store is the source of truth, so a user click on the Signals header
  // button can override between transitions. Each stage transition re-fires
  // this effect (story-beat reset), which clobbers a prior user toggle by
  // design — once the narrative moves on, the next beat's intended layout
  // wins.
  //
  // Media/browser-session is NOT stage-driven anymore — only the Media
  // header button opens/closes it. The recording stage was removed.
  //
  // FLAG: if this effect ever fights a different writer to signalsPanelOpen
  // (e.g. if we add network-driven signal data that opens the panel), we'll
  // get a flicker. Right now the landing-page store is the only writer.
  useEffect(() => {
    // Signals panel stays open through the timeline reveal (stage 4); it
    // only auto-closes at stage 5 so the span + ask-ai panels have room.
    setSignalsPanelOpen(stage <= 4);
  }, [stage, setSignalsPanelOpen]);

  const llmSpanIds = useMemo(() => spans.filter((s) => s.spanType === SpanType.LLM).map((s) => s.spanId), [spans]);

  // Spans only become clickable at the final stage; stored in a ref so the
  // callback identity doesn't change across stage transitions. Scrolling
  // back below stage 5 clears the selection so the span panel doesn't flash
  // open mid-transition on the way down.
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
    if (stage < 5 && selectedSpan) setSelectedSpan(undefined);
  }, [stage, selectedSpan, setSelectedSpan]);

  const handleSpanSelect = useCallback(
    (span?: TraceViewSpan) => {
      if (stageRef.current !== 5) return;
      setSelectedSpan(span);
    },
    [setSelectedSpan]
  );
  const handleCloseSpan = useCallback(() => setSelectedSpan(undefined), [setSelectedSpan]);

  const isShowSpanView = stage === 5 && !!selectedSpan && !!trace;

  useEffect(() => {
    onAllPanelsOpenChange?.(isShowSpanView);
  }, [isShowSpanView, onAllPanelsOpenChange]);

  // Track the header's natural height so the bento can animate cleanly from
  // it (stages 1-2 — content is just the morph card, whose height tweens
  // during the slack→signal morph) to 680 (stage 3+). ResizeObserver catches
  // size changes that don't trigger a re-render here (the morph card
  // animates its own height internally).
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeaderHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      initial={{
        borderColor: "rgb(37 37 38 / 0)",
        backgroundColor: "rgb(15 15 15 / 0)",
        height: 0,
      }}
      animate={{
        borderColor: stage >= 3 ? "rgb(37 37 38)" : "rgb(37 37 38 / 0)",
        backgroundColor: stage >= 3 ? "rgb(15 15 15)" : "rgb(15 15 15 / 0)",
        height: stage >= 3 ? BENTO_HEIGHT : headerHeight,
      }}
      // Height snaps at stages 1-2 so the bento tracks the morph card's
      // own height tween frame-by-frame (otherwise each ResizeObserver
      // update would queue its own 300ms tween, stacking 300ms of lag).
      // Only animate height at stage 3+ where the actual headerHeight→680
      // growth needs to be smooth.
      transition={{
        borderColor: TWEEN,
        backgroundColor: TWEEN,
        height: stage >= 3 ? TWEEN : { duration: 0 },
      }}
      className="flex flex-row rounded-md overflow-hidden border"
    >
      {/* LEFT COLUMN — 400px wide, stretches to the bento's animated height
          via align-items: stretch. flex-1 transcript inside absorbs the
          excess space at stage 3+ once the bento has grown to 680. */}
      <div className="flex flex-col w-[400px] shrink-0">
        {/* TRACE VIEW HEADER — row 1 buttons + signal card (the simplified
            morph). Production puts the signal card directly inside the
            header's flex-col, after the rows; we do the same. The ref feeds
            the ResizeObserver that drives the bento's pre-stage-3 height. */}
        <div ref={headerRef} className="flex flex-col px-2 pt-1.5 pb-2 shrink-0">
          {/* Row 1 — fades in at stage 3 */}
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: stage >= 3 ? ROW1_HEIGHT : 0, opacity: stage >= 3 ? 1 : 0 }}
            transition={TWEEN}
            className="overflow-hidden"
          >
            <TraceViewHeaderRow1
              signalsActive={signalsPanelOpen}
              chatActive={stage >= 5}
              onSignalsToggle={() => setSignalsPanelOpen(!signalsPanelOpen)}
            />
          </motion.div>

          {/* Signal card morph — content-driven height (measured inside the
              morph). Wrapping motion.div caps via maxHeight + collapses when
              the user (or stage transition) closes the signals panel. At
              stages 1-2 the morph IS the entire content and the header
              hasn't appeared yet, so signalsPanelOpen is forced true by the
              stage-sync effect — the card stays visible until stage 4 fires
              the auto-close.
              marginTop only applies when row 1 is present, so at stages 1-2
              the morph sits flush with the header's top padding. */}
          <motion.div
            initial={{ maxHeight: SIGNAL_CARD_MAX, marginTop: 0 }}
            animate={{
              maxHeight: signalsPanelOpen ? SIGNAL_CARD_MAX : 0,
              marginTop: stage === 3 ? 8 : 0,
            }}
            transition={TWEEN}
            className="overflow-hidden"
          >
            <SlackToSignalMorph progress={morphProgress} className="w-full max-w-none" />
          </motion.div>
        </div>

        {/* CONDENSED TIMELINE — appears at stage 4 */}
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: stage >= 4 ? TIMELINE_HEIGHT : 0 }}
          transition={TWEEN}
          className="overflow-hidden shrink-0"
        >
          <div style={{ height: TIMELINE_HEIGHT }} className="w-full border-b">
            <CondensedTimeline />
          </div>
        </motion.div>

        {/* TRANSCRIPT PANEL HEADER (toolbar) — always visible once the trace
            view materializes (stage 3+), not gated to the timeline. Lives in
            production at `trace-panel.tsx` as the panel's own header row. */}
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: stage >= 3 ? TOOLBAR_HEIGHT : 0 }}
          transition={TWEEN}
          className="overflow-hidden shrink-0"
        >
          <div
            style={{ height: TOOLBAR_HEIGHT }}
            className="w-full flex items-center justify-between gap-2 px-2 border-b "
          >
            <div className="flex items-center gap-2 min-w-0">
              <ViewDropdown isDisableHint />
              {trace && <TraceStatsShields className="min-w-0 overflow-hidden" trace={trace} />}
            </div>
            <Button
              disabled={!trace}
              className={cn("h-6 px-1.5 text-xs overflow-hidden", browserSession && "border-primary text-primary")}
              variant="outline"
              onClick={() => setBrowserSession(!browserSession)}
            >
              <CirclePlay size={14} className="flex-shrink-0" />
              <span className="ml-1 truncate">Media</span>
            </Button>
          </div>
        </motion.div>

        {/* TRANSCRIPT — flex-1 absorbs the excess vertical space once the
            bento is 680 tall (stage 3+). min-h-0 lets it shrink to 0 at
            stages 1-2 when the bento collapses to header height. */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {stage >= 3 && <Transcript onSpanSelect={handleSpanSelect} isShared />}
        </div>

        {/* RECORDING — visibility driven entirely by the store's
            browserSession field. The Media header button is the only writer
            — there's no stage-sync (the recording stage was removed). */}
        <motion.div
          animate={{ height: browserSession ? RECORDING_HEIGHT : 0 }}
          transition={TWEEN}
          className="overflow-hidden shrink-0"
        >
          <div style={{ height: RECORDING_HEIGHT }} className="w-full border-t">
            {browserSession && trace && (
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

      {/* MIDDLE COL — span view. Opens only when the user clicks a span at
          stage 5 (clicks are ignored before then). */}
      <motion.div
        initial={{ width: 0 }}
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

      {/* RIGHT COL — ask-ai, appears at stage 5 */}
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: stage >= 5 ? 360 : 0 }}
        transition={TWEEN}
        className="overflow-hidden h-full shrink-0"
      >
        <div className="w-[360px] h-full bg-background border-l">{stage >= 5 && <AskAi />}</div>
      </motion.div>
    </motion.div>
  );
};

export default TraceBento;
