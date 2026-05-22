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
import { cn, swrFetcher } from "@/lib/utils";

import { bodyMedium, microLabel, subSection, subSubSection } from "../../class-names";
import SectionFootnote from "../section-footnote";
import TraceViewErrorBoundary from "./error-boundary";
import TraceBento, { type Phase } from "./trace-bento";

const TWEEN: Transition = { type: "tween", duration: 0.3, ease: "easeInOut" };

const TRACE_ID = "281e042a-75d4-5c83-c56e-1b31f0a73080";

const T_PHASE_2 = 0.25;
const T_PHASE_3 = 0.5;
const T_PHASE_4 = 0.75;

const INACTIVE_OPACITY = 0.4;

// Stack y endpoints expressed as % of the motion.div's own height (framer
// resolves string `y` values against the element's height). At progress 0
// the stack shifts DOWN by STACK_Y_TRAVEL%, pushing block 1 into the upper
// portion of the viewport; at progress 1 it shifts UP by the same amount
// so block 4 takes that slot. Knob: bump STACK_Y_TRAVEL to push the
// active block further from the geometric center.

interface BandConfig {
  /** Footnote label inside the right rectangle. Should match the bento's
   *  visual state for this phase (see Phase comment in trace-bento.tsx). */
  name: string;
  /** Top-level section title — only present on phases 1 and 2 (the
   *  "section roots"). Phases 3 and 4 are subsections of phase 2 and
   *  use `subtitle` instead. */
  title?: string;
  /** Subsection title — used by phases 3 and 4, which sit under
   *  phase 2's "Understand why in seconds." parent. Rendered with
   *  the `subSubSection` style (smaller than `subSection`). */
  subtitle?: string;
  body: ReactNode;
  learnMoreHref: string;
}

// Step labels for phases 1 and 2 only. Phases 3 and 4 are unlabeled
// subsections of section 02 ("Understand why in seconds") and reuse
// the parent's number visually — no separate "2.1" / "2.2" labels,
// per user direction. Numbering picks back up at "03." in
// has-this-issue.tsx for the next top-level section.
const STEP_LABELS: Partial<Record<1 | 2 | 3 | 4, string>> = {
  1: "01.",
  2: "02.",
};

// Copy follows the `copy` branch's `stage-text.tsx` shape. Phases 3 and 4
// were title-only on that branch; the user asked for every phase to have
// both title + body here, so 3 and 4 get new bodies authored from the
// bento's actual visual state ("focus on simplicity").
const BANDS: Record<1 | 2 | 3 | 4, BandConfig> = {
  1: {
    name: "Notifications",
    title: "Get alerts when\nyour agent breaks.",
    body: "Describe what you want to track in plain English. Laminar analyzes traces of your agent and pings you in Slack the moment a trace matches.",
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
    subtitle: "See every action on a timeline.",
    body: "Laminar makes the agent run navigable by surfacing input, LLM reasoning, tool calls, and sub-agents as a readable transcript.",
    learnMoreHref: "https://laminar.sh/docs/tracing",
  },
  4: {
    name: "Ask AI",
    subtitle: "Long complex run? Chat with AI",
    body: "Ask any question, dive deep into any agent run. Click span references to jump straight into context.",
    learnMoreHref: "https://laminar.sh/docs/tracing",
  },
};

const progressToPhase = (p: number): Phase => {
  if (p < T_PHASE_2) return 1;
  if (p < T_PHASE_3) return 2;
  if (p < T_PHASE_4) return 3;
  return 4;
};

// LEFT-stack: only the stack `y` is a continuous MotionValue derived
// from `scrollYProgress` via `useTransform` — that's what keeps the
// stack glide smooth across phase boundaries instead of snapping.
// Per-block opacity is driven by the discrete `phase` state (see the
// JSX below) so it just toggles between 1 and INACTIVE_OPACITY at the
// phase thresholds, with a CSS transition softening the change.
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
  // String values resolve as % of the motion.div's own height — works for
  // any natural block heights, no measurement needed.
  const stackY = useTransform(scrollYProgress, [0, 1], [`${20}%`, `${-50}%`]);

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
        <div className="flex gap-18">
          {/* LEFT — sticky stacked text. The relative wrapper's
              `minHeight` drives the grid row height (= section's scroll
              length). The sticky child pins for the entire section. */}
          <div className="relative min-w-0 h-[240vh] flex-1">
            <div className="sticky top-0 h-screen overflow-hidden flex flex-col justify-center items-center">
              <div className="h-[760px] w-full overflow-hidden relative">
                {/* Top gradient — text fades into page bg at top of viewport */}
                <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-landing-surface-700 to-transparent pointer-events-none h-[100px]" />

                {/* Stack wrapper — vertically centered in viewport via flex
                  items-center. Inner motion.div uses `style={{ y }}` with
                  a MotionValue, so framer updates the transform on every
                  scroll frame without re-rendering React. */}
                <div className="absolute inset-0 flex items-center">
                  <motion.div style={{ y: stackY }} className="flex flex-col gap-32 w-full">
                    {([1, 2, 3, 4] as const).map((n) => {
                      const config = BANDS[n];
                      return (
                        // Opacity driven by the discrete `phase` state —
                        // snaps between full and INACTIVE_OPACITY on phase
                        // change, softened by a CSS opacity transition.
                        // No framer involvement; remove the transition
                        // class if you want a hard snap.
                        <div
                          key={n}
                          style={{ opacity: phase === n ? 1 : INACTIVE_OPACITY }}
                          className="flex flex-col transition-opacity duration-300 ease-out"
                        >
                          {STEP_LABELS[n] && <span className={cn(microLabel, "mb-4")}>{STEP_LABELS[n]}</span>}
                          {config.title && <h2 className={cn(subSection, "mb-4")}>{config.title}</h2>}
                          {config.subtitle && <h3 className={cn(subSubSection, "mb-2")}>{config.subtitle}</h3>}
                          <p className={cn(bodyMedium, "text-justify")}>{config.body}</p>
                        </div>
                      );
                    })}
                  </motion.div>
                </div>

                {/* Bottom gradient — text fades into page bg at bottom of viewport */}
                <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-landing-surface-700 to-transparent pointer-events-none h-[120px]" />
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
                <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-landing-surface-550 to-transparent pointer-events-none h-[120px]" />

                {/* Left gradient — only at phase 4 (ask-ai panel open).
                    Always rendered so the CSS opacity transition can fade
                    it in/out cleanly on phase change. */}
                <div
                  className={cn(
                    "absolute bottom-0 left-0 top-0 z-10 bg-gradient-to-r from-landing-surface-550/80 to-transparent pointer-events-none w-[120px] transition-opacity duration-300 ease-out",
                    phase === 4 ? "opacity-100" : "opacity-0"
                  )}
                />

                <SectionFootnote name={activeBand.name} href={activeBand.learnMoreHref} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </TraceViewErrorBoundary>
  );
};

export default UnderstandWhyTraceView;
