"use client";

import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { type RefObject, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { bodyMedium, LANDING_COLUMN_MAX_W, microLabel, subSection, subSubSection } from "../../class-names";
import LearnMoreLink from "../learn-more-link";
import { SIGNAL_HEADER_H } from "../signal-event-card";
import ClustersStage from "./clusters-stage";
import TraceViewErrorBoundary from "./error-boundary";
import { assemblyLayout, CLUSTERS_CARD_H_SEED, EDGE_FADE_W_CLS, FRAME_H, PANEL_H } from "./geometry";
import { SpanSelectionProvider } from "./mock/selection";
import SignalStack from "./signal-stack";
import { DEFAULT_STACK_TIMING, phase } from "./stack-timing";
import { STEP_COUNT, STEP_NUMBERS, type StepNumber, STEPS } from "./steps";
import TracePanel from "./trace-panel";

// One trace, one panel, one scroll observer. The panel never travels; only the
// copy does, at constant velocity across every bit of the pinned range — a
// pinned section that consumes scroll while nothing moves is scroll-jacking.
// The closing gesture therefore plays OVER the last step, not in its own window.

/** Whole-number index of every step — the input range for the per-step maps. */
const STEP_STOPS = STEP_NUMBERS.map((_, i) => i);

/** Height of the viewport, in the same vh units as everything below. The
 *  sticky children are `h-screen`, so this is exact, not an estimate. */
const VIEWPORT_VH = 100;

/** Scroll length per copy step, and the only lever on how much pinned scroll
 *  the closing sequence gets — the sticky tail after the last hand-off is
 *  exactly one of these, whatever STEP_COUNT is. */
const STEP_VH = 80;

/** How long the section stays pinned — one step of travel per hand-off, and
 *  the copy uses every bit of it. See COPY_END. */
const PINNED_VH = (STEP_COUNT - 1) * STEP_VH;

/** The section's scroll length: the pinned range plus one viewport of overrun
 *  AFTER the release, which is where Act 2 plays as the section departs. */
export const SECTION_VH = PINNED_VH + VIEWPORT_VH;

/** Where the sticky children RELEASE. The observer runs to `"end start"`, not
 *  `"end end"`, so there is a coordinate for "after the release" — otherwise
 *  the pill could never still be falling as the section leaves. */
const UNPIN = PINNED_VH / SECTION_VH;

/** Where the copy finishes travelling: the release, EXACTLY, not a fraction of
 *  it. Do not reintroduce a tail — to give the stack more room, lengthen
 *  STEP_VH or the post-release overrun. */
const COPY_END = UNPIN;

/** Scroll progress at which each copy block sits dead centre (linear). */
const STEP_CENTERS = STEP_STOPS.map((i) => (i / (STEP_COUNT - 1)) * COPY_END);

/** The closing sequence's window, and the shared coordinate every phase in
 *  ./stack-timing is a fraction of. TWO steps, not one: the sequence has marks
 *  on both of the last two copy blocks. */
const STACK_WINDOW_START = STEP_CENTERS[STEP_COUNT - 3];

/** Constant visual gap between copy blocks. Equal SLOTS would not give equal
 *  gaps — centring splits each slot's leftover between its neighbours — so
 *  blocks are their natural height and the stops are measured. */
const STEP_GAP = 150;

const INACTIVE_OPACITY = 0.4;

/** How far below its arming point Act 2 disarms. */
const ACT2_HYSTERESIS = 0.04;

/** Spans the panel opens on. FOUR, not three: the first is the run's root,
 *  which renders no row, so this is input + LLM + tool + LLM — one whole
 *  think-act-observe loop. `pinned` lifts the cap. */
const OPENING_SPANS = 4;

/** Rough block height, used only to seed the stops before the first
 *  measurement. The section is far below the fold, so the seed is never on
 *  screen; it exists so the very first paint isn't stacked at zero. */
const ESTIMATED_BLOCK_H = 180;

/** The y offset that centres each block: `stackHeight / 2 - centreOf(block)`.
 *  Downstream is untouched — the scroll curves still map a step index to a
 *  keyframe array, that array is just measured now. */
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
  // The clusters card grows as Act 2 reveals its rows, and the assembly stays
  // centred on it — so its height has to come back up here.
  const [clustersCardH, setClustersCardH] = useState(CLUSTERS_CARD_H_SEED);
  const { pillTop, cardTop } = assemblyLayout(SIGNAL_HEADER_H, clustersCardH);

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

  // Mount-time sync for the two latches above, matching `act2` and `pinned`.
  // Belt-and-braces today: the observer's first measurement moves progress off
  // zero, which IS a change, so both handlers already fire on a restored
  // scroll. It is here so all four latches arm the same way rather than two of
  // them resting on that being true.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setStep((prev) => {
        const next = (Math.round(copyIndex.get()) + 1) as StepNumber;
        return prev === next ? prev : next;
      });
      setFlying(flight.get() > 0);
    });
    return () => cancelAnimationFrame(id);
  }, [copyIndex, flight]);

  // The panel opens at the sticky pin, which is what this observer already
  // calls 0: approaching the section progress is clamped and emits nothing, so
  // its first change IS the pin. An IntersectionObserver would fire on the
  // frame's leading edge, while it is still moving. Latched, not scrubbed.
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

  return (
    <TraceViewErrorBoundary>
      {/* Wraps the WHOLE section, not just the panel: the copy on the left has
          inline links that select spans in the same panel. */}
      <SpanSelectionProvider>
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
                            {config.learnMore && (
                              <LearnMoreLink
                                className="mt-5 self-start"
                                label={config.learnMore.label}
                                href={config.learnMore.href}
                              />
                            )}
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
                  style={{ height: FRAME_H }}
                  className="rounded-sm bg-surface-250 overflow-hidden relative w-[480px] 2xl:w-[540px]"
                >
                  <motion.div
                    style={{ height: PANEL_H, opacity: trayOpacity }}
                    className="absolute inset-y-0 my-auto left-1/2 -translate-x-1/2 rounded-md overflow-hidden border bg-background"
                  >
                    <TracePanel
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
                      <ClustersStage
                        rise={cardRise}
                        restY={cardTop}
                        onHeight={setClustersCardH}
                        armed={act2}
                        landed={act2}
                        timing={stackTiming}
                      />
                    </>
                  )}

                  {/* Vignettes: exactly the panel's resting margin wide, so
                      they sit over bare frame background and only bite on the
                      signal stack's cascade, which is wider than the frame.
                      Held at 80% so a card stays legible through them rather
                      than dissolving into the frame. */}
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 z-10 bg-gradient-to-r from-surface-250/80 to-transparent pointer-events-none",
                      EDGE_FADE_W_CLS
                    )}
                  />
                  <div
                    className={cn(
                      "absolute inset-y-0 right-0 z-10 bg-gradient-to-l from-surface-250/80 to-transparent pointer-events-none",
                      EDGE_FADE_W_CLS
                    )}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </SpanSelectionProvider>
    </TraceViewErrorBoundary>
  );
};

export default UnderstandWhyTraceView;
