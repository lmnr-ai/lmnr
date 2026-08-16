"use client";

import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import dynamic from "next/dynamic";
import { type RefObject, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import TraceViewStoreProvider, { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import { cn, swrFetcher } from "@/lib/utils";

import { bodyMedium, LANDING_COLUMN_MAX_W, microLabel, subSection, subSubSection } from "../../class-names";
import SectionFootnote from "../section-footnote";
import { SIGNAL_PARALLEL_CANCEL_SPAN_ID } from "../signal-event-card";
import AskAi from "./ask-ai";
import TraceViewErrorBoundary from "./error-boundary";
import { CHAT_W, EDGE_FADE_W, FRAME_H, FRAME_W, PANEL_H, TRAY_GAP, TRAY_X } from "./geometry";
import { SHARED_TRACE_API } from "./shared-trace-api";
import SignalStack from "./signal-stack";
import { DEFAULT_STACK_TIMING, phase, type StackTiming } from "./stack-timing";
import { COMPLEX_TRACE_ID, SIMPLE_TRACE_ID, STEP_COUNT, STEP_NUMBERS, type StepNumber, STEPS } from "./steps";
import TracePanel from "./trace-panel";

// ──────────────────────────────────────────────────────────────────────
// Scroll model
//
// Two curves over the SAME scroll observer, because the two columns want
// opposite things:
//
//   copyIndex  linear     ╱────────────────────╱   the copy is text being
//                                                  read — constant velocity,
//                                                  no plateaus, no ramps.
//                                                  Anything else reads as
//                                                  scroll-jacking.
//
//   viewIndex  plateaued  ──────╱──────╱──────╱─   the trace panel has to sit
//                                                  STILL long enough to read,
//                                                  so it rests on each step
//                                                  and slides between them.
//
// They stay phase-locked without a shared value: each viewIndex ramp is
// centred on the progress where copyIndex crosses the midpoint between two
// blocks, which is also where the discrete `step` flips
// (`Math.round(copyIndex)`). So the right-hand action, the copy hand-off and
// the opacity swap all land on the same frame — the copy just never stops
// moving to wait for them.
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

/** Scroll length per copy step. */
const STEP_VH = 60;

/** How long the section stays pinned — one step of travel per hand-off, and
 *  the copy uses every bit of it. See COPY_END. */
const PINNED_VH = (STEP_COUNT - 1) * STEP_VH;

/** The section's scroll length: the pinned range plus one viewport of overrun
 *  AFTER the release, which is where the pill finishes falling out of frame. */
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

/** Fraction of one step spent sliding rather than parked. Wider = gentler
 *  slide, less time to read. Expressed as a fraction rather than an absolute
 *  progress so it survives a change to STEP_COUNT or STEP_VH — both move
 *  STEP_CENTERS, and a hardcoded half-width would silently re-tune itself. */
const VIEW_RAMP_FRACTION = 0.43;
const VIEW_RAMP = ((COPY_END / (STEP_COUNT - 1)) * VIEW_RAMP_FRACTION) / 2;

/** The step-6 window: from step 5's copy centring to the section unpinning.
 *  Every phase in ./stack-timing is a fraction of THIS, which is what lets the
 *  flight, the collapse and the drop share one coordinate and one dial dock. */
const STACK_WINDOW_START = STEP_CENTERS[STEP_COUNT - 2];

/** The sticky release, expressed in the step-6 window's own 0-1 coordinate.
 *  Handed to the dials as a read-only reference bar, so the drop can be dragged
 *  deliberately past it rather than by guesswork. */
const UNPIN_IN_WINDOW = (UNPIN - STACK_WINDOW_START) / (1 - STACK_WINDOW_START);

// Dev-only live tuning. `IS_DEV` is inlined at build time, so the whole
// dynamic() call — and the dialkit chunk behind it — is dead code in a
// production build and never reaches the landing bundle.
const IS_DEV = process.env.NODE_ENV !== "production";
const StackDials = IS_DEV
  ? dynamic(() => import("./stack-dials.tsx").then((mod) => mod.default), { ssr: false })
  : null;

const VIEW_STOPS: number[] = [];
const VIEW_INDEX: number[] = [];
for (let i = 0; i < STEP_COUNT - 1; i++) {
  const midpoint = (STEP_CENTERS[i] + STEP_CENTERS[i + 1]) / 2;
  VIEW_STOPS.push(midpoint - VIEW_RAMP, midpoint + VIEW_RAMP);
  VIEW_INDEX.push(i, i + 1);
}

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

const TRAY_X_BY_STEP = STEP_NUMBERS.map((n) => TRAY_X[STEPS[n].view]);
const CHAT_W_BY_STEP = STEP_NUMBERS.map((n) => (STEPS[n].view === "trace2Chat" ? CHAT_W : 0));
/** Left-edge fade — only earns its keep while the chat slide overflows. */
const LEFT_FADE_BY_STEP = CHAT_W_BY_STEP.map((w) => (w > 0 ? 1 : 0));

const INACTIVE_OPACITY = 0.4;

/** Deep enough that the pill is well faded before it reaches the frame edge —
 *  roughly 4x the pill's own height. */
const BOTTOM_FADE_H = 140;

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
  const viewIndex = useTransform(scrollYProgress, VIEW_STOPS, VIEW_INDEX);

  const stackRef = useRef<HTMLDivElement>(null);
  const stackStops = useStackStops(stackRef);
  const stackY = useTransform(copyIndex, STEP_STOPS, stackStops);
  const trayX = useTransform(viewIndex, STEP_STOPS, TRAY_X_BY_STEP);
  const chatWidth = useTransform(viewIndex, STEP_STOPS, CHAT_W_BY_STEP);
  const leftFadeOpacity = useTransform(viewIndex, STEP_STOPS, LEFT_FADE_BY_STEP);

  const [stackTiming, setStackTiming] = useState<StackTiming>(DEFAULT_STACK_TIMING);

  // Step 6's three phases, all fractions of one window so they can overlap
  // freely and one dial dock can author all of them. Function-form transforms
  // (not [in]/[out] ranges) so a dial change is picked up on the next render
  // rather than being captured at mount.
  const window6 = useTransform(scrollYProgress, [STACK_WINDOW_START, 1], [0, 1]);
  const flight = useTransform(window6, (t) => phase(t, stackTiming.flightAt, stackTiming.flightSpan));
  const collapse = useTransform(window6, (t) => phase(t, stackTiming.collapseAt, stackTiming.collapseSpan));
  const drop = useTransform(window6, (t) => phase(t, stackTiming.dropAt, stackTiming.dropSpan));

  // The trace fades out under the card as it leaves.
  const trayOpacity = useTransform(flight, (f) => 1 - phase(f, 0, stackTiming.trayFadeEnd));
  // Bottom fade arrives during the collapse, ahead of the drop it exists for.
  const bottomFadeOpacity = useTransform(collapse, [0, 0.5], [0, 1]);

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

  const { data: simpleTrace } = useSWR<TraceViewTrace>(`${SHARED_TRACE_API}/${SIMPLE_TRACE_ID}`, swrFetcher);
  const { data: simpleSpans } = useSWR<TraceViewSpan[]>(`${SHARED_TRACE_API}/${SIMPLE_TRACE_ID}/spans`, swrFetcher);
  const { data: complexTrace } = useSWR<TraceViewTrace>(`${SHARED_TRACE_API}/${COMPLEX_TRACE_ID}`, swrFetcher);
  const { data: complexSpans } = useSWR<TraceViewSpan[]>(`${SHARED_TRACE_API}/${COMPLEX_TRACE_ID}/spans`, swrFetcher);

  const activeStep = STEPS[step];

  return (
    <TraceViewErrorBoundary>
      {StackDials && <StackDials onChange={setStackTiming} unpinAt={UNPIN_IN_WINDOW} />}
      {/* Trace 1's store wraps the WHOLE section: the copy on the left has
          inline links that scroll trace 1's transcript. Trace 2's provider is
          nested further down and shadows this one for its own subtree only. */}
      <TraceViewStoreProvider storeKey="landing-trace-simple" initialTrace={simpleTrace}>
        <section ref={sectionRef} className={cn("relative w-full mx-auto px-6 lg:px-0", LANDING_COLUMN_MAX_W)}>
          <div className="flex gap-18 2xl:gap-36">
            {/* LEFT — the copy stack. The wrapper's height IS the section's
                scroll length (every step, plus the outro); the sticky child
                pins for all of it. */}
            <div className="relative min-w-0 flex-1" style={{ height: `${SECTION_VH}vh` }}>
              <div className="sticky top-0 h-screen overflow-hidden flex flex-col justify-center items-center">
                <div className="w-full overflow-hidden relative" style={{ height: FRAME_H }}>
                  <div className="absolute top-0 left-0 right-0 z-10 h-[100px] bg-gradient-to-b from-surface-700 to-transparent pointer-events-none" />

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

                  <div className="absolute bottom-0 left-0 right-0 z-10 h-[120px] bg-gradient-to-t from-surface-700 to-transparent pointer-events-none" />
                </div>
              </div>
            </div>

            {/* RIGHT — the frame, and the tray that slides inside it. */}
            <div className="relative">
              <div className="sticky top-0 left-0 flex justify-center items-center h-screen">
                <div
                  style={{ width: FRAME_W, height: FRAME_H }}
                  className="rounded-sm bg-surface-500 overflow-hidden relative"
                >
                  <motion.div
                    data-landing-tray
                    style={{ x: trayX, gap: TRAY_GAP, opacity: trayOpacity }}
                    className="absolute inset-y-0 left-0 flex items-center"
                  >
                    <div
                      style={{ height: PANEL_H }}
                      className="flex flex-row rounded-md overflow-hidden border bg-background shrink-0"
                    >
                      <TracePanel
                        trace={simpleTrace}
                        spans={simpleSpans ?? []}
                        showTimeline={step >= 2}
                        chatActive={false}
                      />
                    </div>

                    {/* Trace 2 — its own store, so selections and panel state
                        stay independent of trace 1's. */}
                    <TraceViewStoreProvider storeKey="landing-trace-complex" initialTrace={complexTrace}>
                      <div
                        style={{ height: PANEL_H }}
                        className="flex flex-row rounded-md overflow-hidden border bg-background shrink-0"
                      >
                        <TracePanel
                          trace={complexTrace}
                          spans={complexSpans ?? []}
                          // Closes when the chat opens, one step BEFORE the
                          // signals card needs the room.
                          showTimeline={step <= 3}
                          chatActive={step === 4}
                          showSignals
                          // Stays open through step 6: the stack measures this
                          // card's box, and a collapse would move it mid-flight.
                          signalsOpen={step >= 5}
                          revealSpanId={step >= 5 ? SIGNAL_PARALLEL_CANCEL_SPAN_ID : undefined}
                          signalCardHidden={flying}
                        />

                        {/* Chat — width is scroll-derived, so it opens in
                            lockstep with the tray sliding to make room. */}
                        <motion.div style={{ width: chatWidth }} className="overflow-hidden h-full shrink-0">
                          <div style={{ width: CHAT_W }} className="h-full bg-background border-l">
                            {step >= 4 && <AskAi />}
                          </div>
                        </motion.div>
                      </div>
                    </TraceViewStoreProvider>
                  </motion.div>

                  {/* Mounted a step early so its measurements and first layout
                      are done before the flight starts; `visible` is what
                      actually reveals it. Deliberately BELOW the z-10 vignettes
                      — the front card bleeds off the left edge and the gradient
                      softens that crop. */}
                  {step >= 5 && (
                    <SignalStack
                      flight={flight}
                      collapse={collapse}
                      drop={drop}
                      visible={flying}
                      timing={stackTiming}
                    />
                  )}

                  {/* Vignettes: exactly the resting margin wide, so they are
                      invisible while a slide is parked and only soften the cut
                      mid-slide. Held at 80% so a passing card stays legible
                      through them rather than dissolving into the frame. */}
                  <div
                    style={{ width: EDGE_FADE_W }}
                    className="absolute inset-y-0 left-0 z-10 bg-gradient-to-r from-surface-500/80 to-transparent pointer-events-none"
                  />
                  <div
                    style={{ width: EDGE_FADE_W }}
                    className="absolute inset-y-0 right-0 z-10 bg-gradient-to-l from-surface-500/80 to-transparent pointer-events-none"
                  />

                  {/* The chat slide is wider than the frame, so the transcript
                      runs off the left edge — this softens the cut. Nothing
                      overflows in the other two views, hence the opacity map.
                      Tops out at 80% like the edge vignettes: a full-opacity
                      stop reads as a hard wall rather than a fade. */}
                  <motion.div
                    style={{ opacity: leftFadeOpacity }}
                    className="absolute inset-y-0 left-0 z-10 w-[128px] bg-gradient-to-r from-surface-500/80 via-surface-500/55 to-transparent pointer-events-none"
                  />

                  {/* Bottom fade — the pill dissolves through it on the way out
                      instead of being hard-clipped by the frame edge. Held at
                      zero until the collapse so it never sits over the trace
                      panel, whose transcript has its own bottom fade. */}
                  <motion.div
                    style={{ opacity: bottomFadeOpacity, height: BOTTOM_FADE_H }}
                    className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-surface-500/80 to-transparent pointer-events-none"
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
