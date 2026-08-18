"use client";

import { motion, type Transition, useInView } from "framer-motion";
import { ChevronDown, List } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { DEMO_SPANS } from "../demo-trace";
import { SIGNAL_BG, SIGNAL_BORDER, SignalContent } from "../signal-event-card";
import { PANEL_W_CLS } from "./geometry";
import PanelHeaderRow from "./mock/panel-header-row";
import { useSpanSelection } from "./mock/selection";
import Timeline from "./mock/timeline";
import TraceStats from "./mock/trace-stats";
import Transcript from "./mock/transcript";
import ScanSweep from "./scan-sweep";
import { SCAN_MS, useSignalReveal } from "./use-signal-reveal";
import { useStagger } from "./use-stagger";

const TWEEN: Transition = { type: "tween", duration: 0.3, ease: "easeInOut" };

/** Kept separate from TWEEN even at the same duration: `DIM_CLS` below has to
 *  mirror THIS one — the dim is the card opening, not the timeline — so
 *  retuning the timeline must not silently desync it. */
const CARD_TWEEN: Transition = { type: "tween", duration: 0.3, ease: "easeInOut" };

const ROW1_HEIGHT = 28;
const TOOLBAR_HEIGHT = 36;
// Don't shrink this for a flat run: the panel height is fixed, so a shorter
// timeline just moves the same empty space into the transcript below it.
const TIMELINE_HEIGHT = 120;

/** Wall-clock gap between spans arriving. Each one moves four things at once
 *  (row, bar, axis, shields), so it needs longer than a plain list. Ceiling is
 *  the copy: the run must finish inside the 576px from the pin to step 2. */
const SPAN_STEP_MS = 600;

/** Everything that is not the signal card drops back while the card is open,
 *  so the card carries the eye. Matches the card collapser's own tween. */
const DIM_CLS = "transition-opacity duration-300 ease-in-out";

interface Props {
  /** Condensed timeline reveal. */
  showTimeline: boolean;
  /** Cap on how many spans may be revealed so far. Raising it resumes the
   *  stream from where it stopped rather than replaying from the top. */
  visibleSpans: number;
  /** Spans present from the first paint, with no reveal animation. */
  instantSpans?: number;
  /** Renders the Signals button, and lets the signal-event card open. The card
   *  itself is always mounted — see the collapser below. */
  showSignals?: boolean;
  /** Opens the card with no dim-scan-open sequence. For panels whose signal card
   *  is a resting state rather than a beat — mobile, where the run is still
   *  streaming in when the panel arrives, so there is nothing to scan yet. */
  instantSignals?: boolean;
  /** Step-driven signals-panel state. A user toggle wins until this changes. */
  signalsOpen?: boolean;
  /** Hands the signal card off to ./signal-stack, which draws its own copy from
   *  here on. The card stays MOUNTED and keeps its box — unmounting it would
   *  reflow the transcript underneath at the exact frame the flight starts. */
  signalCardHidden?: boolean;
  /** Blocks USER scrolling of the transcript. Set on touch, where an inner
   *  scroller only traps the page. NOTE: the condensed timeline owns a scroller
   *  of its own that this does NOT cover — mobile keeps `showTimeline` off, so
   *  turning it on there needs that handled too. */
  scrollLocked?: boolean;
}

// One trace view: header + signal card, timeline, toolbar, transcript. Every
// part is drawn by ./mock — no product component, no fetch, so no loading
// state. Must be rendered inside its OWN <SpanSelectionProvider>.
const TracePanel = ({
  showTimeline,
  visibleSpans,
  instantSpans = 0,
  showSignals,
  instantSignals,
  signalsOpen,
  signalCardHidden,
  scrollLocked,
}: Props) => {
  const { selectedSpanId, selectSpan } = useSpanSelection();

  // The run streams into ONE list, which both the transcript and the condensed
  // timeline render — so a span appears in the two on the same frame, and the
  // timeline's axis extends as the run arrives, the way the product does on a
  // live trace.
  const panelRef = useRef<HTMLDivElement>(null);
  const inView = useInView(panelRef, { once: true, amount: 0.3 });
  const revealed = useStagger(Math.min(visibleSpans, DEMO_SPANS.length), inView, SPAN_STEP_MS, instantSpans);
  const streaming = revealed < DEMO_SPANS.length;

  // The root carries the FINISHED run's end, which put the whole 25s axis on
  // screen before anything had happened. While streaming it is clipped to the
  // last span that has arrived, so the axis grows with the run.
  const revealedSpans = useMemo(() => {
    const slice = DEMO_SPANS.slice(0, revealed);
    if (!streaming) return slice;
    const frontier = Math.max(...slice.filter((s) => s.parentSpanId).map((s) => s.endMs));
    if (!Number.isFinite(frontier)) return slice;
    return slice.map((s) => (s.parentSpanId ? s : { ...s, endMs: frontier }));
  }, [revealed, streaming]);

  // Step-driven, but a user toggle of the Signals button survives until the
  // narrative moves on. Adjusted DURING render off the previous prop rather
  // than in an effect: an effect would open the card a frame late, and every
  // frame here is scrubbed against the scroll.
  const [signalsPanelOpen, setSignalsPanelOpen] = useState(!!signalsOpen);
  const [lastStepState, setLastStepState] = useState(!!signalsOpen);
  if (lastStepState !== !!signalsOpen) {
    setLastStepState(!!signalsOpen);
    setSignalsPanelOpen(!!signalsOpen);
  }

  // The dim lands the moment signals arm; the scan and then the card follow it.
  // `signalCardHidden` skips the wait — it means the flight is already under
  // way, and the stack measures a card that must be at full height by then.
  const signalsArmed = !!showSignals && signalsPanelOpen;
  const { scanning, cardOpen } = useSignalReveal(signalsArmed, !!signalCardHidden || !!instantSignals);

  return (
    <div ref={panelRef} className={cn("flex flex-col shrink-0 h-full", PANEL_W_CLS)}>
      {/* Bottom padding exists only to keep the timeline's axis labels off
          whatever ends the header — the Signals button, or the signal card.
          When the timeline is closed the transcript toolbar follows, and its
          own border + padding are enough, so any gap here just reads as slack. */}
      <div className={cn("flex flex-col px-2 pt-1.5 shrink-0", showTimeline ? "pb-[6px]" : "pb-0")}>
        <div style={{ height: ROW1_HEIGHT }} className={cn("shrink-0", DIM_CLS, signalsArmed && "opacity-40")}>
          <PanelHeaderRow
            signalsActive={signalsPanelOpen}
            showSignals={!!showSignals}
            onSignalsToggle={() => setSignalsPanelOpen(!signalsPanelOpen)}
          />
        </div>

        {/* Signal card. ALWAYS MOUNTED — gating the mount on `signalCardOpen`
            made the open one-way, since scrolling up unmounted it in the same
            commit that should have collapsed it. `height: auto`, not a cap: a
            cap runs most of the tween past the content where nothing moves. */}
        <motion.div
          initial={false}
          animate={{ height: cardOpen ? "auto" : 0, marginTop: cardOpen ? 8 : 0 }}
          // Snaps rather than tweens once the flight owns the card: the stack
          // measures this box, and it is already invisible by then.
          transition={signalCardHidden ? { duration: 0 } : CARD_TWEEN}
          className="overflow-hidden"
        >
          {/* `data-landing-signal-card` is the measurement target for the
              flight — see ./signal-stack. No transition on the opacity: this is
              an instant swap between two identical cards, and a fade would
              briefly show both. */}
          <div
            data-landing-signal-card
            style={{
              borderColor: SIGNAL_BORDER,
              backgroundColor: SIGNAL_BG,
              opacity: signalCardHidden ? 0 : 1,
            }}
            className="rounded-md border overflow-hidden"
          >
            <SignalContent onSpanClick={selectSpan} onClose={() => setSignalsPanelOpen(false)} />
          </div>
        </motion.div>
      </div>

      {/* Everything below the signal card dims with it, so the card is the only
          thing at full strength. The two BORDERED regions share one wrapper —
          fading them apart reveals their borders against each other — but the
          transcript dims on its own below, so neither inherits the other's
          opacity. Both use DIM_CLS, so they still move as one. The scan spans
          all three, which is what `relative` is here for. */}
      <div className="flex flex-col flex-1 min-h-0 relative overflow-hidden">
        <div className={cn("flex flex-col shrink-0", DIM_CLS, signalsArmed && "opacity-40")}>
          <motion.div
            initial={false}
            animate={{ height: showTimeline ? TIMELINE_HEIGHT : 0 }}
            transition={TWEEN}
            className="overflow-hidden shrink-0"
          >
            <div style={{ height: TIMELINE_HEIGHT }} className="w-full border-b">
              <Timeline spans={revealedSpans} selectedSpanId={selectedSpanId} onSelect={selectSpan} />
            </div>
          </motion.div>

          {/* Decorative replica of the product's view dropdown — the real one's
              tree view has nothing to draw against this data, so it's a static
              button. */}
          <div
            style={{ height: TOOLBAR_HEIGHT }}
            className="w-full shrink-0 flex items-center gap-2 px-2 border-b overflow-hidden"
          >
            <div className="flex items-center h-6 px-1.5 text-xs border rounded-md bg-background text-muted-foreground shrink-0">
              <List size={14} className="mr-1" />
              <span className="text-primary-foreground">Transcript</span>
              <ChevronDown size={14} className="ml-1" />
            </div>
            {/* Duration, tokens and cost climb with the run, then hand back to
                the trace's own totals so they land on the real numbers rather
                than a client-side re-sum of them. */}
            <TraceStats className="min-w-0 overflow-hidden" spans={streaming ? revealedSpans : undefined} />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden relative">
          <div className={cn("absolute inset-0", DIM_CLS, signalsArmed && "opacity-40")}>
            <Transcript spans={revealedSpans} instantSpans={instantSpans} scrollLocked={scrollLocked} />
          </div>
          {/* Fades the clipped last row into the panel's own background. Fading
              to the FRAME's colour instead would read as a haze over the card. */}
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        </div>

        {/* Over the content, not behind it: the timeline paints its own
            surface, so a pass underneath would vanish for the top 156px and
            only reappear on the transparent transcript. Last child and outside
            both dims, so it crosses all three regions at full strength. */}
        <ScanSweep active={scanning} durationMs={SCAN_MS} />
      </div>
    </div>
  );
};

export default TracePanel;
