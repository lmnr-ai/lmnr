"use client";

import { motion, type MotionValue, type Transition } from "framer-motion";
import { ChevronDown, ChevronsRight, CirclePlay, Maximize, Radio, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import SessionPlayer from "@/components/shared/traces/session-player";
import { TraceStatsShields } from "@/components/traces/stats-shields";
import CondensedTimeline from "@/components/traces/trace-view/condensed-timeline";
import { type TraceViewSpan, type TraceViewTrace, useTraceViewStore } from "@/components/traces/trace-view/store";
import Transcript from "@/components/traces/trace-view/transcript";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import ViewDropdown from "@/components/traces/trace-view/view-dropdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { SIGNAL_PARALLEL_CANCEL_SPAN_ID } from "../signal-event-card";
import SlackToSignalMorph from "../slack-to-signal-morph";
import AskAi from "./ask-ai";
import { useSelectAndRevealSpan } from "./use-select-and-reveal-span";

// ──────────────────────────────────────────────────────────────────────
// Phase — five animation states ("variants") that the bento renders.
// Phases 1-4 are driven by the parent's scroll-window useInView wiring;
// phase 5 is reserved for an imperative trigger (future user logic) and
// currently renders identically to phase 4.
//
//   1 — Slack notification (morph card shows slack, no trace-view chrome)
//   2 — Trace view materializes (signal card + transcript + toolbar)
//   3 — Condensed timeline appears
//   4 — Ask-AI panel opens, spans become clickable
//   5 — Reserved (visually = phase 4 for now)
// ──────────────────────────────────────────────────────────────────────
export type Phase = 1 | 2 | 3 | 4 | 5;

interface Props {
  phase: Phase;
  /** 0 = pure slack, 1 = pure signal. Tween is driven by phase at the
   *  parent — the bento just forwards it to SlackToSignalMorph. */
  morphProgress: MotionValue<number>;
  trace?: TraceViewTrace;
  spans: TraceViewSpan[];
  /** Fires when the trace view's three-panel state changes (true once the
   *  user has clicked a span at phase ≥ 4 so Trace + Span + AskAi are all open). */
  onAllPanelsOpenChange?: (open: boolean) => void;
}

const TWEEN: Transition = { type: "tween", duration: 0.3, ease: "easeInOut" };

// Phase 1→2 entry: fluid simultaneous open (morph + chrome both
// transition over TWEEN), THEN the auto-select fires at +500ms (kicks
// off the transcript scroll while the row data is loading) and the
// flash kicks in 100ms after so the chip pulses once the row is on
// screen — flashing at the same instant as the select was firing
// before the transcript had rendered.
const PHASE2_SELECT_AT_MS = 500;
const PHASE2_FLASH_START_MS = 600;
const PHASE2_FLASH_CLEAR_MS = 1200;

// Bento animates height between its natural content size at phase 1
// (measured via ResizeObserver on the header, since the morph card's own
// height changes during the slack→signal tween) and a fixed 680 at phase 2+.
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
//   │ CondensedTimeline               │  phase 3+
//   ├─────────────────────────────────┤
//   │ Transcript Panel Header         │  ViewDropdown + Stats + Media (phase 2+)
//   ├─────────────────────────────────┤
//   │ Transcript (flex-1)             │
//   ├─────────────────────────────────┤
//   │ Recording                       │  store browserSession — user toggle only
//   └─────────────────────────────────┘
//
// The bento outer is fixed at BENTO_HEIGHT once the trace view materializes
// at phase 2. Per-section motion.divs animate height into that budget; the
// transcript is flex-1 and absorbs whatever's left.
const TraceBento = ({ phase, morphProgress, trace, spans, onAllPanelsOpenChange }: Props) => {
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

  const selectAndRevealSpan = useSelectAndRevealSpan();

  useEffect(() => {
    if (!trace || spans.length === 0) return;
    setSpans(enrichSpansWithPending(spans));
    setTrace(trace);
    if (trace.hasBrowserSession) setHasBrowserSession(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace?.id, spans.length]);

  // Mount-once defaults that override the shared trace-view store base:
  //
  // - `signalsPanelOpen` defaults to false in the store. We force it open
  //   so the slack→signal morph card is visible in phase 1.
  //
  // - `browserSession` defaults to `initialTrace.hasBrowserSession || false`
  //   in the store, which auto-opens the recording player when the trace
  //   has a session. On the landing page we want the player closed by
  //   default; the user re-opens it via the Media header button.
  //
  // After mount, the user is the only writer for both — no phase sync, no
  // "story-beat reset". Zustand setters are referentially stable so this
  // effect's dep array is effectively empty.
  useEffect(() => {
    setSignalsPanelOpen(true);
    setBrowserSession(false);
  }, [setSignalsPanelOpen, setBrowserSession]);

  // Spans become clickable at phase ≥ 2 (trace view materialized). The
  // span PANEL stays gated to phase ≥ 4 (ask-ai open) below — selection
  // at phase 2/3 just drives the transcript highlight + auto-scroll.
  // Scrolling back below phase 2 clears the selection so a stale
  // highlight doesn't persist into the slack-only phase 1 state.
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
    if (phase < 2 && selectedSpan) setSelectedSpan(undefined);
  }, [phase, selectedSpan, setSelectedSpan]);

  const handleSpanSelect = useCallback(
    (span?: TraceViewSpan) => {
      if (phaseRef.current < 2) return;
      setSelectedSpan(span);
    },
    [setSelectedSpan]
  );

  // Phase ≥ 2 entry — sequenced over ~1.1s:
  //   t=0–350  : slack→signal morph (driven by morphProgress in the parent)
  //   t=400–1000: parallel-cancel Bash chip pulses (CSS keyframe)
  //   t=600–1000: trace-view chrome animates in (chrome delay below)
  //   t=1100   : selectAndRevealSpan fires + flash clears
  //
  // One-shot per approach from phase < 2: a ref guards re-firing, but
  // resets when the user scrolls back below phase 2 so re-entering fires
  // a fresh sequence. No cleanup on the timers — a fast 1→2→3→4 scroll
  // would otherwise cancel the pending select before it ran.
  //
  // We flash the parallel-cancel Bash chip (the second Bash chip in the
  // signal panel) because it lives at the top level of the transcript
  // (`…query.Bash`) — no subagent expansion needed, the row is in
  // flatRows immediately at phase 2. The planning LLM span and the first
  // Bash (`command not found`) both live inside the pagination Agent
  // subagent and would require selectAndRevealSpan to expand the group
  // first; that works, but introduces a brief visual lag while the
  // transcript reflows. Top-level target keeps the reveal instantaneous.
  //
  // FLAG: tied to SIGNAL_PARALLEL_CANCEL_SPAN_ID. If the trace gets
  // swapped, both that constant in signal-event-card.tsx and the
  // corresponding chip in SignalContent must update together or the
  // auto-select will target a non-existent row and the transcript scroll
  // will no-op silently.
  const [flashSpanId, setFlashSpanId] = useState<string | undefined>(undefined);
  const autoSelectFiredRef = useRef(false);
  useEffect(() => {
    if (phase < 2) {
      autoSelectFiredRef.current = false;
      return;
    }
    if (autoSelectFiredRef.current) return;
    autoSelectFiredRef.current = true;

    window.setTimeout(() => selectAndRevealSpan(SIGNAL_PARALLEL_CANCEL_SPAN_ID), PHASE2_SELECT_AT_MS);
    window.setTimeout(() => setFlashSpanId(SIGNAL_PARALLEL_CANCEL_SPAN_ID), PHASE2_FLASH_START_MS);
    window.setTimeout(() => setFlashSpanId(undefined), PHASE2_FLASH_CLEAR_MS);
  }, [phase, selectAndRevealSpan]);

  const handleSignalSpanClick = useCallback(
    (spanId: string) => {
      selectAndRevealSpan(spanId);
    },
    [selectAndRevealSpan]
  );

  const isShowSpanView = phase >= 4 && !!selectedSpan && !!trace;

  useEffect(() => {
    onAllPanelsOpenChange?.(isShowSpanView);
  }, [isShowSpanView, onAllPanelsOpenChange]);

  // Track the header's natural height so the bento can animate cleanly from
  // it (phase 1 — content is just the morph card, whose height tweens
  // during the slack→signal morph as phase shifts 1→2) to BENTO_HEIGHT
  // (phase 2+). ResizeObserver catches size changes that don't trigger a
  // re-render here (the morph card animates its own height internally).
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
        borderColor: phase >= 2 ? "rgb(37 37 38)" : "rgb(37 37 38 / 0)",
        backgroundColor: phase >= 2 ? "rgb(15 15 15)" : "rgb(15 15 15 / 0)",
        height: phase >= 2 ? BENTO_HEIGHT : headerHeight,
      }}
      // Height snaps at phase 1 so the bento tracks the morph card's
      // own height tween frame-by-frame (otherwise each ResizeObserver
      // update would queue its own 300ms tween, stacking 300ms of lag).
      // Only animate height at phase 2+ where the actual headerHeight→680
      // growth needs to be smooth.
      transition={{
        borderColor: TWEEN,
        backgroundColor: TWEEN,
        height: phase >= 2 ? TWEEN : { duration: 0 },
      }}
      className="flex flex-row rounded-md overflow-hidden border"
    >
      {/* LEFT COLUMN — 400px wide, stretches to the bento's animated height
          via align-items: stretch. flex-1 transcript inside absorbs the
          excess space at phase 2+ once the bento has grown to 680. */}
      <div className="flex flex-col w-[400px] shrink-0">
        {/* TRACE VIEW HEADER — row 1 buttons + signal card (the simplified
            morph). Production puts the signal card directly inside the
            header's flex-col, after the rows; we do the same. The ref feeds
            the ResizeObserver that drives the bento's pre-phase-2 height. */}
        <div ref={headerRef} className="flex flex-col px-2 pt-1.5 pb-2 shrink-0">
          {/* Row 1 — fades in at phase 2 */}
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: phase >= 2 ? ROW1_HEIGHT : 0, opacity: phase >= 2 ? 1 : 0 }}
            transition={TWEEN}
            className="overflow-hidden"
          >
            <TraceViewHeaderRow1
              signalsActive={signalsPanelOpen}
              chatActive={phase >= 4}
              onSignalsToggle={() => setSignalsPanelOpen(!signalsPanelOpen)}
            />
          </motion.div>

          {/* Signal card morph — content-driven height (measured inside the
              morph). Wrapping motion.div caps via maxHeight + collapses when
              the user closes the signals panel. The mount-once store effect
              opens the panel; after that it's user-driven.
              marginTop only applies when row 1 is present, so at phase 1
              the morph sits flush with the header's top padding. */}
          <motion.div
            initial={{ maxHeight: SIGNAL_CARD_MAX, marginTop: 0 }}
            animate={{
              maxHeight: signalsPanelOpen ? SIGNAL_CARD_MAX : 0,
              marginTop: phase === 2 ? 8 : 0,
            }}
            transition={TWEEN}
            className="overflow-hidden"
          >
            <SlackToSignalMorph
              progress={morphProgress}
              className="w-full max-w-none"
              flashSpanId={flashSpanId}
              onSpanClick={handleSignalSpanClick}
            />
          </motion.div>
        </div>

        {/* CONDENSED TIMELINE — appears at phase 3 */}
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: phase >= 3 ? TIMELINE_HEIGHT : 0 }}
          transition={TWEEN}
          className="overflow-hidden shrink-0"
        >
          <div style={{ height: TIMELINE_HEIGHT }} className="w-full border-b">
            <CondensedTimeline />
          </div>
        </motion.div>

        {/* TRANSCRIPT PANEL HEADER (toolbar) — always visible once the trace
            view materializes (phase 2+), not gated to the timeline. Lives in
            production at `trace-panel.tsx` as the panel's own header row. */}
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: phase >= 2 ? TOOLBAR_HEIGHT : 0 }}
          transition={TWEEN}
          className="overflow-hidden shrink-0"
        >
          <div
            style={{ height: TOOLBAR_HEIGHT }}
            className="w-full flex items-center justify-between gap-2 px-2 border-b "
          >
            <div className="flex items-center gap-2 min-w-0">
              <ViewDropdown />
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
            bento is 680 tall (phase 2+). min-h-0 lets it shrink to 0 at
            phase 1 when the bento collapses to header height. */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {phase >= 2 && <Transcript onSpanSelect={handleSpanSelect} isShared />}
        </div>

        {/* RECORDING — visibility driven entirely by the store's
            browserSession field. The Media header button is the only writer
            — there's no phase-sync. */}
        <motion.div
          animate={{ height: browserSession ? RECORDING_HEIGHT : 0 }}
          transition={TWEEN}
          className="overflow-hidden shrink-0"
        >
          <div style={{ height: RECORDING_HEIGHT }} className="w-full border-t">
            {browserSession && trace && <SessionPlayer onClose={noop} traceId={trace.id} />}
          </div>
        </motion.div>
      </div>

      {/* RIGHT COL — ask-ai, appears at phase 4 */}
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: phase >= 4 ? 360 : 0 }}
        transition={TWEEN}
        className="overflow-hidden h-full shrink-0"
      >
        <div className="w-[360px] h-full bg-background border-l">{phase >= 4 && <AskAi />}</div>
      </motion.div>
    </motion.div>
  );
};

export default TraceBento;
