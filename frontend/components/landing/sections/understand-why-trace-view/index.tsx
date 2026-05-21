"use client";

import {
  animate,
  motion,
  type Transition,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "framer-motion";
import { type ReactNode, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import TraceViewStoreProvider, { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import { swrFetcher } from "@/lib/utils";

import { bodyMedium, subSection } from "../../class-names";
import SectionFootnote from "../section-footnote";
import TraceViewErrorBoundary from "./error-boundary";
import TraceBento, { type Phase } from "./trace-bento";

const TWEEN: Transition = { type: "tween", duration: 0.3, ease: "easeInOut" };

const TRACE_ID = "281e042a-75d4-5c83-c56e-1b31f0a73080";

const T_PHASE_2 = 0.25;
const T_PHASE_3 = 0.5;
const T_PHASE_4 = 0.75;

const BLOCK_PITCH_PX = 200;

const INACTIVE_OPACITY = 0.4;

const GRADIENT_FADE_PX = 128;

interface BandConfig {
  /** Footnote label inside the right rectangle. Should match the bento's
   *  visual state for this phase (see Phase comment in trace-bento.tsx). */
  name: string;
  title: string;
  body: ReactNode;
  learnMoreHref: string;
}

// Copy follows the `copy` branch's `stage-text.tsx` shape. Phases 3 and 4
// were title-only on that branch; the user asked for every phase to have
// both title + body here, so 3 and 4 get new bodies authored from the
// bento's actual visual state ("focus on simplicity"). Phases 1 and 2
// bodies are TRIMMED versions of the copy-branch originals — the
// originals wrap to 4+ lines at this column width, which blows past the
// BLOCK_PITCH_PX container. If the user later wants the full versions
// back, bump BLOCK_PITCH_PX (and SECTION_MIN_VH proportionally so the
// stack still fits in one viewport).
const BANDS: Record<1 | 2 | 3 | 4, BandConfig> = {
  1: {
    name: "Notifications",
    title: "Get alerts when\nyour agent breaks.",
    body: "Describe what you want to track in plain English. Laminar pings you in Slack the moment a trace matches.",
    learnMoreHref: "https://laminar.sh/docs/signals",
  },
  2: {
    name: "Trace view",
    title: "Understand why\nin seconds.",
    body: "Go from issue description to the\nexact step that caused it.",
    learnMoreHref: "https://laminar.sh/docs/tracing",
  },
  3: {
    name: "Timeline",
    title: "See every action\non a timeline.",
    body: "Spot the slow step at a glance.",
    learnMoreHref: "https://laminar.sh/docs/tracing",
  },
  4: {
    name: "Ask AI",
    title: "Long complex run?\nChat with AI about it.",
    body: "Ask questions, get answers\ngrounded in the actual run.",
    learnMoreHref: "https://laminar.sh/docs/tracing",
  },
};

const progressToPhase = (p: number): Phase => {
  if (p < T_PHASE_2) return 1;
  if (p < T_PHASE_3) return 2;
  if (p < T_PHASE_4) return 3;
  return 4;
};

// LEFT-stack continuous values: stack `y` and per-block opacity are
// derived directly from `scrollYProgress` via `useTransform` (inside the
// component), so the stack moves and dims smoothly with the scroll
// rather than snapping at phase thresholds. The bento on the right
// keeps the discrete `phase` state — its internal animations are
// phase-keyed (slack → trace view → timeline → ask AI), so snapping
// there is intentional.
//
// Stack y endpoints: at scrollYProgress 0, block 1 is centered
// (`y = +1.5 * pitch`); at scrollYProgress 1, block 4 is centered
// (`y = -1.5 * pitch`). Linear interp between.
//
// Per-block opacity: block N peaks (opacity = 1) at scrollYProgress
// = (N-1)/3 and fades to INACTIVE_OPACITY over a 1/3 span on either
// side. The 1/3 span equals one block-pitch of stack movement, so
// adjacent blocks reach INACTIVE_OPACITY when this one is at peak.
const STACK_Y_MAX = 1.5 * BLOCK_PITCH_PX;
const STACK_Y_OFFSET = -160;
const BLOCK_OPACITY_FADE_SPAN = 1 / 3;

const UnderstandWhyTraceView = () => {
  // Single scroll observer for the whole section. Don't add a second
  // `useScroll` — two observers can drift on resize.
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Phase is discrete (1|2|3|4) — drives the BENTO and footnote only.
  // `useMotionValueEvent` fires every frame but we only `setPhase` when
  // the bucket actually changes — so React renders exactly at the three
  // phase boundaries.
  const [phase, setPhase] = useState<Phase>(1);
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = progressToPhase(p);
    setPhase((prev) => (prev === next ? prev : next));
  });

  // Smooth left-stack y, derived directly from scrollYProgress so the
  // stack glides continuously rather than snapping at phase boundaries.
  const stackY = useTransform(scrollYProgress, [0, 1], [STACK_Y_OFFSET + STACK_Y_MAX, STACK_Y_OFFSET - STACK_Y_MAX]);

  // Per-block opacity. Block N peaks at scrollYProgress (N-1)/3 and
  // fades to INACTIVE_OPACITY over BLOCK_OPACITY_FADE_SPAN on either
  // side. Outside the input range, useTransform clamps to the edge
  // output (= INACTIVE_OPACITY), so far-away blocks stay dim.
  const opacity1 = useTransform(
    scrollYProgress,
    [-BLOCK_OPACITY_FADE_SPAN, 0, BLOCK_OPACITY_FADE_SPAN],
    [INACTIVE_OPACITY, 1, INACTIVE_OPACITY]
  );
  const opacity2 = useTransform(scrollYProgress, [0, 1 / 3, 2 / 3], [INACTIVE_OPACITY, 1, INACTIVE_OPACITY]);
  const opacity3 = useTransform(scrollYProgress, [1 / 3, 2 / 3, 1], [INACTIVE_OPACITY, 1, INACTIVE_OPACITY]);
  const opacity4 = useTransform(
    scrollYProgress,
    [2 / 3, 1, 1 + BLOCK_OPACITY_FADE_SPAN],
    [INACTIVE_OPACITY, 1, INACTIVE_OPACITY]
  );
  const blockOpacities = [opacity1, opacity2, opacity3, opacity4];

  // Slack→signal morph progress (0 = slack, 1 = signal). Driven by phase
  // via framer's `animate` helper so `SlackToSignalMorph` keeps its
  // existing `MotionValue<number>` contract.
  const morphProgress = useMotionValue(0);
  useEffect(() => {
    const controls = animate(morphProgress, phase >= 2 ? 1 : 0, TWEEN);
    return () => controls.stop();
  }, [phase, morphProgress]);

  const { data: trace } = useSWR<TraceViewTrace>(`/api/shared/traces/${TRACE_ID}`, swrFetcher);
  const { data: spans } = useSWR<TraceViewSpan[]>(`/api/shared/traces/${TRACE_ID}/spans`, swrFetcher);

  // `progressToPhase` only returns 1..4; cast narrows the broader `Phase`
  // type (which includes the reserved `5`) to the BANDS key set.
  const activeBand = BANDS[phase as 1 | 2 | 3 | 4];

  return (
    <TraceViewErrorBoundary>
      <section ref={sectionRef} className="relative w-full max-w-[880px] mx-auto">
        <div className="flex gap-10">
          {/* LEFT — sticky stacked text. The relative wrapper's
              `minHeight` drives the grid row height (= section's scroll
              length). The sticky child pins for the entire section. */}
          <div className="relative min-w-0 h-[240vh] flex-1">
            <div className="sticky top-0 h-screen overflow-hidden flex flex-col justify-center items-center">
              <div className="h-[760px] w-full overflow-hidden relative">
                {/* Top gradient — text fades into page bg at top of viewport */}
                <div
                  style={{ height: GRADIENT_FADE_PX }}
                  className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-landing-surface-700 to-transparent pointer-events-none"
                />

                {/* Stack wrapper — vertically centered in viewport via flex
                  items-center. Inner motion.div uses `style={{ y }}` with
                  a MotionValue, so framer updates the transform on every
                  scroll frame without re-rendering React. */}
                <div className="absolute inset-0 flex items-center">
                  <motion.div style={{ y: stackY }} className="flex flex-col w-full">
                    {([1, 2, 3, 4] as const).map((n) => {
                      const config = BANDS[n];
                      return (
                        <div key={n} style={{ height: BLOCK_PITCH_PX }} className="flex flex-col justify-center">
                          {/* Opacity is a per-block MotionValue. Wrapped on
                            inner motion so the outer fixed-height
                            container keeps a stable layout regardless of
                            its child's opacity. */}
                          <motion.div style={{ opacity: blockOpacities[n - 1] }} className="flex flex-col gap-3">
                            <span className="text-xs tracking-wider text-landing-text-400">{`0${n}.`}</span>
                            <h2 className={`${subSection} whitespace-pre-line`}>{config.title}</h2>
                            <p className={bodyMedium}>{config.body}</p>
                          </motion.div>
                        </div>
                      );
                    })}
                  </motion.div>
                </div>

                {/* Bottom gradient — text fades into page bg at bottom of viewport */}
                <div
                  style={{ height: GRADIENT_FADE_PX }}
                  className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-landing-surface-700 to-transparent pointer-events-none"
                />
              </div>
            </div>
          </div>

          {/* RIGHT — see LAYOUT comment above for the outer/inner pattern.
              `min-w-full shrink-0` on the inner keeps the bento centered
              when its natural width fits, and right-anchored when it
              overflows (the inner grows past parent's content area, and
              `justify-end` on outer pins its right edge).
              Top + bottom gradient fades mirror the LEFT column, but
              fade INTO the rectangle's own bg (`landing-surface-550`)
              rather than the page bg. z-10 puts gradients above the
              bento (z-0) and below the footnote (z-20 inside
              SectionFootnote), so the footnote stays legible over the
              bottom gradient. */}
          <div className="relative">
            <div className="sticky top-0 left-0 flex justify-center items-center h-screen">
              <div className="w-[480px] h-[760px] rounded-sm bg-landing-surface-550 overflow-hidden flex items-center justify-end px-5 relative">
                <div className="min-w-full shrink-0 flex items-center justify-center">
                  <TraceViewStoreProvider storeKey="landing-understand-why" initialTrace={trace}>
                    <TraceBento phase={phase} morphProgress={morphProgress} trace={trace} spans={spans ?? []} />
                  </TraceViewStoreProvider>
                </div>

                {/* Bottom gradient */}
                <div
                  style={{ height: GRADIENT_FADE_PX }}
                  className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-landing-surface-550 to-transparent pointer-events-none"
                />

                <SectionFootnote step={`0${phase}`} name={activeBand.name} href={activeBand.learnMoreHref} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </TraceViewErrorBoundary>
  );
};

export default UnderstandWhyTraceView;
