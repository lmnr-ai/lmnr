"use client";

import { motion, type Transition } from "framer-motion";
import { ChevronDown, ChevronsRight, List, Maximize, Radio, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { TraceStatsShields } from "@/components/traces/stats-shields";
import CondensedTimeline from "@/components/traces/trace-view/condensed-timeline";
import { type TraceViewSpan, type TraceViewTrace, useTraceViewStore } from "@/components/traces/trace-view/store";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { SIGNAL_BG, SIGNAL_BORDER, SignalContent } from "../signal-event-card";
import { PANEL_W } from "./geometry";
import LandingTranscript from "./landing-transcript";
import { useSelectAndRevealSpan } from "./use-select-and-reveal-span";

const TWEEN: Transition = { type: "tween", duration: 0.3, ease: "easeInOut" };

const ROW1_HEIGHT = 28;
const TOOLBAR_HEIGHT = 36;
const SIGNAL_CARD_MAX = 320;
// Don't shrink this for a flat run: the panel height is fixed, so a shorter
// timeline just moves the same empty space into the transcript below it.
const TIMELINE_HEIGHT = 120;

// Reveal timings, relative to the moment the step becomes active. The delay
// lets the tray's slide settle before the transcript starts scrolling, so the
// two motions read as sequential rather than fighting each other.
const REVEAL_AT_MS = 350;
const FLASH_START_MS = 450;
const FLASH_CLEAR_MS = 1100;

const HEADER_ITEM_CLS = "flex items-center h-7";

/** Everything that is not the signal card drops back while the card is open,
 *  so the card carries the eye. Matches the card collapser's own tween. */
const DIM_CLS = "transition-opacity duration-300 ease-in-out";

// Row 1 of the production trace-view header, trimmed for the landing page:
// close, maximize, "Trace" + dropdown, Signals. Everything except Signals is
// decorative (disabled + disabled:opacity-100).
const PanelHeaderRow = ({
  signalsActive,
  showSignals,
  onSignalsToggle,
}: {
  signalsActive: boolean;
  showSignals: boolean;
  onSignalsToggle: () => void;
}) => (
  <div className="flex items-center gap-1">
    <span className={cn(HEADER_ITEM_CLS, "gap-0.5")}>
      <Button aria-label="Collapse panel" variant="ghost" disabled className="h-7 px-0.5 disabled:opacity-100">
        <ChevronsRight className="w-5 h-5" />
      </Button>
      <Button aria-label="Expand" variant="ghost" disabled className="h-7 px-0.5 disabled:opacity-100">
        <Maximize className="w-4 h-4" />
      </Button>
    </span>

    <span className={HEADER_ITEM_CLS}>
      <span className="text-base font-medium pl-2 flex-shrink-0">Trace</span>
      <Button aria-label="Expand" variant="ghost" disabled className="h-7 px-1 disabled:opacity-100">
        <ChevronDown className="w-3 h-3" />
      </Button>
    </span>

    <span className={HEADER_ITEM_CLS}>
      <Button variant="outline" disabled className="h-6 text-xs px-1.5 disabled:opacity-100">
        <Sparkles data-icon="inline-start" size={14} className="mr-1" />
        Chat
      </Button>
    </span>

    {showSignals && (
      <span className={HEADER_ITEM_CLS}>
        <Button
          variant="outline"
          onClick={onSignalsToggle}
          className={cn("h-6 text-xs px-1.5", signalsActive && "border-primary text-primary")}
        >
          <Radio data-icon="inline-start" size={14} className="mr-1" />
          Signals (1)
        </Button>
      </span>
    )}
  </div>
);

// Selects + scrolls to `spanId` shortly after it becomes defined, pulsing the
// matching signal chip on the way. The callback is held in a ref because
// `useSelectAndRevealSpan` re-creates it whenever a transcript group expands —
// depending on it directly would re-fire the reveal on every expansion.
const useRevealSpan = (spanId?: string) => {
  const selectAndRevealSpan = useSelectAndRevealSpan();
  const selectRef = useRef(selectAndRevealSpan);
  useEffect(() => {
    selectRef.current = selectAndRevealSpan;
  }, [selectAndRevealSpan]);

  const [flashSpanId, setFlashSpanId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!spanId) return;
    const timers = [
      window.setTimeout(() => selectRef.current(spanId), REVEAL_AT_MS),
      window.setTimeout(() => setFlashSpanId(spanId), FLASH_START_MS),
      window.setTimeout(() => setFlashSpanId(undefined), FLASH_CLEAR_MS),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [spanId]);

  return flashSpanId;
};

interface Props {
  trace?: TraceViewTrace;
  spans: TraceViewSpan[];
  /** Condensed timeline reveal. */
  showTimeline: boolean;
  /** Cap on transcript rows — see ./landing-transcript. */
  visibleRows: number;
  /** Renders the Signals button + the signal-event card. */
  showSignals?: boolean;
  /** Step-driven signals-panel state. A user toggle wins until this changes. */
  signalsOpen?: boolean;
  /** Set to auto-select + scroll to a span once this panel's step is reached. */
  revealSpanId?: string;
  /** Hands the signal card off to ./signal-stack, which draws its own copy from
   *  here on. The card stays MOUNTED and keeps its box — unmounting it would
   *  reflow the transcript underneath at the exact frame the flight starts. */
  signalCardHidden?: boolean;
}

// One trace view, PANEL_W wide, stretched to its parent's height:
//
//   ┌──────────────────────────┐
//   │ header row + signal card │
//   ├──────────────────────────┤
//   │ condensed timeline       │  showTimeline
//   ├──────────────────────────┤
//   │ transcript toolbar       │
//   ├──────────────────────────┤
//   │ transcript      (flex-1) │
//   └──────────────────────────┘
//
// Must be rendered inside its own TraceViewStoreProvider — the section mounts
// two of these against two different traces.
const TracePanel = ({
  trace,
  spans,
  showTimeline,
  visibleRows,
  showSignals,
  signalsOpen,
  revealSpanId,
  signalCardHidden,
}: Props) => {
  const { setSpans, setTrace, setSelectedSpan, signalsPanelOpen, setSignalsPanelOpen } = useTraceViewStore(
    (state) => ({
      setSpans: state.setSpans,
      setTrace: state.setTrace,
      setSelectedSpan: state.setSelectedSpan,
      signalsPanelOpen: state.signalsPanelOpen,
      setSignalsPanelOpen: state.setSignalsPanelOpen,
    }),
    shallow
  );

  useEffect(() => {
    if (!trace || spans.length === 0) return;
    setSpans(enrichSpansWithPending(spans));
    setTrace(trace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace?.id, spans.length]);

  // Only re-runs when the STEP changes the desired state, so a user toggle of
  // the Signals button survives until the narrative moves on.
  useEffect(() => {
    setSignalsPanelOpen(!!signalsOpen);
  }, [signalsOpen, setSignalsPanelOpen]);

  const flashSpanId = useRevealSpan(revealSpanId);
  const selectAndRevealSpan = useSelectAndRevealSpan();

  const handleSpanSelect = useCallback((span: TraceViewSpan) => setSelectedSpan(span), [setSelectedSpan]);
  const handleSignalSpanClick = useCallback((spanId: string) => selectAndRevealSpan(spanId), [selectAndRevealSpan]);

  const signalCardOpen = !!showSignals && signalsPanelOpen;

  return (
    <div className="flex flex-col shrink-0 h-full" style={{ width: PANEL_W }}>
      {/* Bottom padding exists only to keep the timeline's axis labels off
          whatever ends the header — the Signals button, or the signal card.
          When the timeline is closed the transcript toolbar follows, and its
          own border + padding are enough, so any gap here just reads as slack. */}
      <div className={cn("flex flex-col px-2 pt-1.5 shrink-0", showTimeline ? "pb-[6px]" : "pb-0")}>
        <div style={{ height: ROW1_HEIGHT }} className={cn("shrink-0", DIM_CLS, signalCardOpen && "opacity-75")}>
          <PanelHeaderRow
            signalsActive={signalsPanelOpen}
            showSignals={!!showSignals}
            onSignalsToggle={() => setSignalsPanelOpen(!signalsPanelOpen)}
          />
        </div>

        {/* Signal card — content-sized, capped by maxHeight so the collapse
            tweens without measuring. The collapser must stay visually EMPTY:
            put the border on it and its top + bottom edges still paint a 2px
            blue line at maxHeight 0. */}
        {showSignals && (
          <motion.div
            initial={false}
            animate={{ maxHeight: signalCardOpen ? SIGNAL_CARD_MAX : 0, marginTop: signalCardOpen ? 8 : 0 }}
            transition={TWEEN}
            className="overflow-hidden"
          >
            {/* `data-landing-signal-card` is the measurement target for the
                step-6 flight — see ./signal-stack. No transition on the
                opacity: this is an instant swap between two identical cards,
                and a fade would briefly show both. */}
            <div
              data-landing-signal-card
              style={{
                borderColor: SIGNAL_BORDER,
                backgroundColor: SIGNAL_BG,
                opacity: signalCardHidden ? 0 : 1,
              }}
              className="rounded-md border overflow-hidden"
            >
              <SignalContent
                flashSpanId={flashSpanId}
                onSpanClick={handleSignalSpanClick}
                onClose={() => setSignalsPanelOpen(false)}
              />
            </div>
          </motion.div>
        )}
      </div>

      {/* Everything below the signal card dims with it, so the card is the only
          thing at full strength while it is open. Grouped under one wrapper
          rather than dimmed per-region: three separately-fading siblings would
          reveal their own borders against each other mid-transition. */}
      <div
        className={cn("flex flex-col flex-1 min-h-0", DIM_CLS, signalCardOpen && "opacity-75")}
      >
        <motion.div
          initial={false}
          animate={{ height: showTimeline ? TIMELINE_HEIGHT : 0 }}
          transition={TWEEN}
          className="overflow-hidden shrink-0"
        >
          <div style={{ height: TIMELINE_HEIGHT }} className="w-full border-b">
            <CondensedTimeline />
          </div>
        </motion.div>

        {/* Decorative replica of <ViewDropdown /> — the real dropdown's tree view
            doesn't render against this mock data, so it's a static button. */}
        <div
          style={{ height: TOOLBAR_HEIGHT }}
          className="w-full shrink-0 flex items-center gap-2 px-2 border-b overflow-hidden"
        >
          <div className="flex items-center h-6 px-1.5 text-xs border rounded-md bg-background text-muted-foreground shrink-0">
            <List size={14} className="mr-1" />
            <span className="text-primary-foreground">Transcript</span>
            <ChevronDown size={14} className="ml-1" />
          </div>
          {trace && <TraceStatsShields className="min-w-0 overflow-hidden" trace={trace} />}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden relative">
          <div className="absolute inset-0">
            <LandingTranscript onSpanSelect={handleSpanSelect} visibleRows={visibleRows} />
          </div>
          {/* Fades the clipped last row into the panel's own background. Fading
              to the FRAME's colour instead would read as a haze over the card. */}
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        </div>
      </div>
    </div>
  );
};

export default TracePanel;
