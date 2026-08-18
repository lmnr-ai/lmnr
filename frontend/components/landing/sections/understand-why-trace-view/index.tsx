"use client";

import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { type RefObject, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import TraceViewStoreProvider, { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import { cn, swrFetcher } from "@/lib/utils";

import { bodyMedium, LANDING_COLUMN_MAX_W, microLabel, subSection, subSubSection } from "../../class-names";
import { DEMO_TRACE_ID } from "../demo-trace";
import SectionFootnote from "../section-footnote";
import { SIGNAL_HEADER_H } from "../signal-event-card";
import ClustersStage from "./clusters-stage";
import TraceViewErrorBoundary from "./error-boundary";
import { assemblyLayout, EDGE_FADE_W, FRAME_H, FRAME_W, PANEL_H } from "./geometry";
import { SHARED_TRACE_API } from "./shared-trace-api";
import SignalStack from "./signal-stack";
import { DEFAULT_STACK_TIMING, phase } from "./stack-timing";
import { STEP_COUNT, STEP_NUMBERS, type StepNumber, STEPS } from "./steps";
import TracePanel from "./trace-panel";

// ──────────────────────────────────────────────────────────────────────
// Scroll model
//
// One trace, one panel, one scroll observer. The panel never travels — every
// step is a change of STATE inside it (timeline opens, signals open, a span is
// revealed), so the only thing moving vertically is the copy:
//
//   copyIndex  linear  ╱────────────────────╱   the copy is text being read —
//                                               constant velocity, no
//                                               plateaus, no ramps.
//
// The discrete `step` flips at `Math.round(copyIndex)`, i.e. as a block
// crosses the midpoint to its neighbour, so the panel's state change, the copy
// hand-off and the opacity swap all land on the same frame.
//
// THE COPY NEVER STOPS while the section is pinned. It travels the entire
// pinned range and lands its last block on the exact frame the section
// releases, after which it simply leaves with the page. There is no hold, no
// tail, and no pinned scroll it does not use — a pinned section that consumes
// scroll while nothing moves vertically is scroll-jacking, which is the one
// thing the linear copy curve exists to prevent.
//
// The signal stack's collapse and the pill's exit therefore run OVER the last
// step's travel and on into the post-release overrun, rather than in a quiet
// window of their own. They are the one part of the section not quantised to a
// step, because they are a single continuous gesture rather than a hand-off.
// ──────────────────────────────────────────────────────────────────────

/** Whole-number index of every step — the input range for the per-step maps. */
const STEP_STOPS = STEP_NUMBERS.map((_, i) => i);

/** Height of the viewport, in the same vh units as everything below. The
 *  sticky children are `h-screen`, so this is exact, not an estimate. */
const VIEWPORT_VH = 100;

/** Scroll length per copy step.
 *
 *  It is also the ONLY lever on how much pinned scroll the closing sequence
 *  gets: the sticky tail after the last copy hand-off works out to exactly one
 *  STEP_VH, whatever STEP_COUNT is. Everything from the card's flight to the
 *  pill entering the clusters card has to fit in it, which is why this is 80
 *  and not the 60 the section ran at before it absorbed the clusters beat. */
const STEP_VH = 80;

/** How long the section stays pinned — one step of travel per hand-off, and
 *  the copy uses every bit of it. See COPY_END. */
const PINNED_VH = (STEP_COUNT - 1) * STEP_VH;

/** The section's scroll length: the pinned range plus one viewport of overrun
 *  AFTER the release, which is where Act 2 plays as the section departs. */
export const SECTION_VH = PINNED_VH + VIEWPORT_VH;

/** Where the sticky children RELEASE, in scroll progress.
 *
 *  The observer below runs to `"end start"` — the section fully clear of the
 *  viewport — not to `"end end"`, which is exactly the frame the sticky child
 *  unpins. That distinction is the whole point: with a range ending at the
 *  release there is no coordinate for "after the release", so the pill could
 *  never still be falling as the section leaves. The last VIEWPORT_VH of the
 *  range is that overrun.
 *
 *  Exact rather than measured — both terms are vh and the sticky children are
 *  `h-screen`, so no ResizeObserver is needed to find it. */
const UNPIN = PINNED_VH / SECTION_VH;

/** Where the copy finishes travelling: the release, exactly. NOT a fraction of
 *  it.
 *
 *  This was 0.72 of the pinned range, leaving the last block centred and frozen
 *  for the remaining ~110vh — about 800px of scrolling with nothing moving
 *  vertically on the left — so the stack had a quiet window to collapse in. A
 *  hold that long is scroll-jacking however good the reason, so the stack now
 *  shares the last step's travel instead. Do not reintroduce a tail here: to
 *  give the stack more room, lengthen STEP_VH (which moves the copy slower but
 *  never stops it) or the post-release overrun. */
const COPY_END = UNPIN;

/** Scroll progress at which each copy block sits dead centre (linear). */
const STEP_CENTERS = STEP_STOPS.map((i) => (i / (STEP_COUNT - 1)) * COPY_END);

/** The closing sequence's window: from the copy centring TWO steps from the end
 *  to the end of the section. Every phase in ./stack-timing is a fraction of
 *  THIS, which is what lets the flight, the collapse, the card's rise and the
 *  pill's entry share one coordinate.
 *
 *  Two steps, not one. The sequence has to hit marks on BOTH of the last two
 *  copy blocks — the stack is fully formed as "Similar failures are clustered"
 *  centres, and the pill is inside the clusters card as "Has this failure
 *  occurred before?" centres — and a window opening on the first of those marks
 *  has no room to reach it. */
const STACK_WINDOW_START = STEP_CENTERS[STEP_COUNT - 3];

/** Constant visual gap between consecutive copy blocks.
 *
 *  This used to be a fixed 320px slot per block with the content centred in it,
 *  which made centring the active block a single multiplication. But equal
 *  slots do NOT give equal gaps: centring splits each slot's leftover space
 *  between its two neighbours, so the gap between blocks i and i+1 comes out as
 *  `SLOT_H - (height_i + height_i+1) / 2` — a function of the two blocks'
 *  heights. Measured against the real copy that was [132, 190, 178, 134]px for
 *  what is meant to read as one rhythm.
 *
 *  Blocks are now their natural height with a real gap, so the stack's stops
 *  have to be measured instead of computed. See `useStackStops`. */
const STEP_GAP = 150;

const INACTIVE_OPACITY = 0.4;

/** How far below its arming point Act 2 disarms. */
const ACT2_HYSTERESIS = 0.04;

/** Spans the panel opens on. FOUR, not three: `spans[0]` is the run's root
 *  (`ai.streamText`), which sets the timeline's axis but renders no transcript
 *  row of its own. The three that follow are one full think-act-observe loop,
 *  so the reader opens on input, LLM, tool call, LLM — stopping a span earlier
 *  ends on a tool call nothing answers, which reads as the trace being cut off
 *  rather than paused.
 *
 *  `pinned` lifts the cap and the rest of the run streams in. */
const OPENING_SPANS = 4;

/** Rough block height, used only to seed the stops before the first
 *  measurement. The section is far below the fold, so the seed is never on
 *  screen; it exists so the very first paint isn't stacked at zero. */
const ESTIMATED_BLOCK_H = 180;

/** The y offset that puts each block dead centre in the frame, derived from
 *  layout. `stackY[i] = stackHeight / 2 - centreOf(block i)`, which reduces to
 *  the old `((n-1)/2 - i) * SLOT_H` when every block is the same height — so
 *  this generalises the previous closed form rather than replacing the model.
 *  Everything downstream is untouched: the scroll curves still map step index
 *  to a keyframe array, that array is just measured now. */
const useStackStops = (stackRef: RefObject<HTMLDivElement | null>): number[] => {
  const [stops, setStops] = useState<number[]>(() =>
    STEP_STOPS.map((i) => ((STEP_COUNT - 1) / 2 - i) * (ESTIMATED_BLOCK_H + STEP_GAP))
  );

  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;

    const measure = () => {
      const stackRect = stack.getBoundingClientRect();
      // Positions are read RELATIVE to the stack, so an in-flight scroll
      // transform on the stack itself cancels out and can't skew them.
      const blocks = Array.from(stack.children) as HTMLElement[];
      const next = blocks.map((block) => {
        const rect = block.getBoundingClientRect();
        return stackRect.height / 2 - (rect.top - stackRect.top + rect.height / 2);
      });
      // Bail on a no-op: this runs from a ResizeObserver, and setting state
      // unconditionally would loop.
      setStops((prev) =>
        prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]) < 0.5) ? prev : next
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stack);
    // Observe the blocks too: the stack's own height changing is not the only
    // way the centres move (a body re-wrapping shifts its siblings).
    Array.from(stack.children).forEach((block) => observer.observe(block));
    return () => observer.disconnect();
  }, [stackRef]);

  return stops;
};

const UnderstandWhyTraceView = () => {
  // Single scroll observer for the whole section. Don't add a second
  // `useScroll` — two observers can drift on resize.
  const sectionRef = useRef<HTMLElement>(null);
  // "end start", not "end end" — see UNPIN. The range deliberately overruns the
  // sticky release by one viewport so the drop has somewhere to finish.
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });

  const copyIndex = useTransform(scrollYProgress, [0, COPY_END], [0, STEP_COUNT - 1]);

  const stackRef = useRef<HTMLDivElement>(null);
  const stackStops = useStackStops(stackRef);
  const stackY = useTransform(copyIndex, STEP_STOPS, stackStops);

  const stackTiming = DEFAULT_STACK_TIMING;

  // The last step's three phases, all fractions of one window so they can
  // overlap freely.
  const stackWindow = useTransform(scrollYProgress, [STACK_WINDOW_START, 1], [0, 1]);
  const flight = useTransform(stackWindow, (t) => phase(t, stackTiming.flightAt, stackTiming.flightSpan));
  const collapse = useTransform(stackWindow, (t) => phase(t, stackTiming.collapseAt, stackTiming.collapseSpan));
  const cardRise = useTransform(stackWindow, (t) => phase(t, stackTiming.cardRiseAt, stackTiming.cardRiseSpan));
  const pillEnter = useTransform(stackWindow, (t) => phase(t, stackTiming.pillEnterAt, stackTiming.pillEnterSpan));

  // The trace fades out under the card as it leaves.
  const trayOpacity = useTransform(flight, (f) => 1 - phase(f, 0, stackTiming.trayFadeEnd));

  // The pill and the clusters card rest as one top-anchored assembly — see
  // ./geometry for why it is not centred on a measurement.
  const { pillTop, cardTop } = assemblyLayout(SIGNAL_HEADER_H);

  // Act 2 is time-based, so it needs a boolean, not a scrubbed value. It
  // disarms BELOW its arming point, not at it — otherwise a scroll resting
  // exactly on the trigger re-runs the whole thing on every jitter of the
  // wheel.
  const [act2, setAct2] = useState(false);
  const act2At = stackTiming.act2At;
  useMotionValueEvent(stackWindow, "change", (t) =>
    setAct2((on) => (on ? t >= act2At - ACT2_HYSTERESIS : t >= act2At))
  );
  // "change" only fires on a CHANGE, so a reload landing past the trigger — or
  // a dial dragged under the current scroll position — would otherwise never
  // arm. Deferred a frame so the observer has measured.
  useEffect(() => {
    const id = requestAnimationFrame(() => setAct2(stackWindow.get() >= act2At));
    return () => cancelAnimationFrame(id);
  }, [act2At, stackWindow]);

  const [step, setStep] = useState<StepNumber>(1);
  useMotionValueEvent(copyIndex, "change", (i) => {
    const next = (Math.round(i) + 1) as StepNumber;
    setStep((prev) => (prev === next ? prev : next));
  });

  // The single boolean that hands the card between the panel and the stack.
  // One flag drives BOTH sides, so the card can never be drawn twice (which
  // would double the translucent blue) or zero times. It flips the instant the
  // flight leaves zero, where the two copies are still pixel-aligned.
  const [flying, setFlying] = useState(false);
  useMotionValueEvent(flight, "change", (v) => setFlying(v > 0));

  // The panel's opening gesture fires when the frame has travelled up and
  // STOPPED, dead centre of the viewport. That moment is the sticky pin: the
  // child is `top-0 h-screen` with the frame centred inside it, so its centre
  // sits at `sectionTop + 50vh` while the section approaches and lands on the
  // viewport's centre exactly when `sectionTop` hits 0.
  //
  // Which is what this observer already calls 0 — `offset: ["start start", …]`.
  // No second `useScroll`, no IntersectionObserver: an element-crossing test
  // would fire on the frame's leading EDGE, 340px of scrolling early, while it
  // is still half off the bottom of the screen and still moving.
  //
  // The clamp is the trick. Approaching the section the progress is pinned at 0
  // and never moves, so it emits no change events; the first change it ever
  // reports is the pin itself. Latched, because a stream-in has nothing to
  // rewind to.
  const [pinned, setPinned] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (t) => {
    if (t > 0) setPinned(true);
  });
  // "change" only fires on a CHANGE, so a reload landing inside the section
  // would otherwise never arm. Deferred a frame so the observer has measured.
  useEffect(() => {
    const id = requestAnimationFrame(() => setPinned((on) => on || scrollYProgress.get() > 0));
    return () => cancelAnimationFrame(id);
  }, [scrollYProgress]);

  const { data: trace } = useSWR<TraceViewTrace>(`${SHARED_TRACE_API}/${DEMO_TRACE_ID}`, swrFetcher);
  const { data: spans } = useSWR<TraceViewSpan[]>(`${SHARED_TRACE_API}/${DEMO_TRACE_ID}/spans`, swrFetcher);

  const activeStep = STEPS[step];

  return (
    <TraceViewErrorBoundary>
      {/* Wraps the WHOLE section, not just the panel: the copy on the left has
          inline links that select spans in this same store. */}
      <TraceViewStoreProvider storeKey="landing-demo-trace" initialTrace={trace}>
        <section ref={sectionRef} className={cn("relative w-full mx-auto px-6 lg:px-0", LANDING_COLUMN_MAX_W)}>
          <div className="flex gap-18 2xl:gap-36">
            {/* LEFT — the copy stack. The wrapper's height IS the section's
                scroll length (every step, plus the outro); the sticky child
                pins for all of it. */}
            <div className="relative min-w-0 flex-1" style={{ height: `${SECTION_VH}vh` }}>
              <div className="sticky top-0 h-screen overflow-hidden flex flex-col justify-center items-center">
                <div className="w-full overflow-hidden relative" style={{ height: FRAME_H }}>
                  <div className="absolute top-0 left-0 right-0 z-10 h-[100px] bg-gradient-to-b from-surface-150 to-transparent pointer-events-none" />

                  {/* `items-center` puts the stack's centre at the frame's
                      centre when y = 0, which is the origin `useStackStops`
                      measures its offsets against. */}
                  <div className="absolute inset-0 flex items-center">
                    <motion.div ref={stackRef} style={{ y: stackY, gap: STEP_GAP }} className="flex flex-col w-full">
                      {STEP_NUMBERS.map((n) => {
                        const config = STEPS[n];
                        return (
                          <div
                            key={n}
                            data-landing-step={n}
                            style={{ opacity: step === n ? 1 : INACTIVE_OPACITY }}
                            className="flex flex-col shrink-0 transition-opacity duration-300 ease-out"
                          >
                            {config.label && <span className={cn(microLabel, "mb-4")}>{config.label}</span>}
                            {config.title && <h2 className={cn(subSection, "mb-4")}>{config.title}</h2>}
                            {config.subtitle && <h3 className={cn(subSubSection, "mb-2")}>{config.subtitle}</h3>}
                            <p className={bodyMedium}>{config.richBody ?? config.body}</p>
                          </div>
                        );
                      })}
                    </motion.div>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 z-10 h-[120px] bg-gradient-to-t from-surface-150 to-transparent pointer-events-none" />
                </div>
              </div>
            </div>

            {/* RIGHT — the frame, and the tray that slides inside it. */}
            <div className="relative">
              <div className="sticky top-0 left-0 flex justify-center items-center h-screen">
                <div
                  data-landing-frame
                  style={{ width: FRAME_W, height: FRAME_H }}
                  className="rounded-sm bg-surface-250 overflow-hidden relative"
                >
                  <motion.div
                    style={{ height: PANEL_H, opacity: trayOpacity }}
                    className="absolute inset-y-0 my-auto left-1/2 -translate-x-1/2 rounded-md overflow-hidden border bg-background"
                  >
                    <TracePanel
                      trace={trace}
                      spans={spans ?? []}
                      showTimeline={pinned}
                      visibleSpans={pinned ? Number.POSITIVE_INFINITY : OPENING_SPANS}
                      instantSpans={OPENING_SPANS}
                      showSignals={step >= 2}
                      // Stays open through the last step: the stack measures
                      // this card's box, and a collapse would move it
                      // mid-flight.
                      signalsOpen={step >= 2}
                      signalCardHidden={flying}
                    />
                  </motion.div>

                  {/* Mounted a step early so its measurements and first layout
                      are done before the flight starts; `visible` is what
                      actually reveals it. Deliberately BELOW the z-10 vignettes
                      — the front card bleeds off the left edge and the gradient
                      softens that crop. */}
                  {step >= 2 && (
                    <>
                      <SignalStack
                        flight={flight}
                        collapse={collapse}
                        pillEnter={pillEnter}
                        pillRestY={pillTop}
                        visible={flying}
                        timing={stackTiming}
                      />
                      {/* AFTER the stack, so the opaque clusters card paints over
                          the pill and the pill disappears INTO it rather than
                          fading out on top of it. */}
                      <ClustersStage rise={cardRise} restY={cardTop} armed={act2} landed={act2} timing={stackTiming} />
                    </>
                  )}

                  {/* Vignettes: exactly the panel's resting margin wide, so
                      they sit over bare frame background and only bite on the
                      signal stack's cascade, which is wider than the frame.
                      Held at 80% so a card stays legible through them rather
                      than dissolving into the frame. */}
                  <div
                    style={{ width: EDGE_FADE_W }}
                    className="absolute inset-y-0 left-0 z-10 bg-gradient-to-r from-surface-250/80 to-transparent pointer-events-none"
                  />
                  <div
                    style={{ width: EDGE_FADE_W }}
                    className="absolute inset-y-0 right-0 z-10 bg-gradient-to-l from-surface-250/80 to-transparent pointer-events-none"
                  />

                  <SectionFootnote name={activeStep.footnote.name} href={activeStep.footnote.href} />
                </div>
              </div>
            </div>
          </div>
        </section>
      </TraceViewStoreProvider>
    </TraceViewErrorBoundary>
  );
};

export default UnderstandWhyTraceView;
