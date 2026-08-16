"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { type ReactNode, useRef } from "react";

import { cn } from "@/lib/utils";

import { bodyMedium, microLabel, subSection, subSubSection } from "../../class-names";
import SectionFootnote from "../section-footnote";
import { SIGNAL_CLUSTER_EVENT_COUNT } from "../signal-cluster";
import SignalEventCard from "../signal-event-card";
import SlackNotificationCard from "../slack-notification-card";
import { type StepNumber, STEPS } from "./steps";

// Mobile runs the same six-step copy as the desktop scrolly-tell (imported
// from ./steps so the words can't drift) but drops the scroll choreography —
// each step is a plain block, and the H2 opener carries no panel at all.
//
// Mock widths deliberately overflow a phone viewport; the page root has
// `overflow-x-clip` so the visuals read at full scale without side-scroll.

const TIMELINE_FOOTNOTE = { name: "Timeline", href: "https://laminar.sh/docs/platform/viewing-traces" };

/** Cascade step between stacked cards. Tighter than the desktop stack's, which
 *  can afford a wider fan inside a 480px frame; here the cascade is already
 *  running off both edges of a phone. */
const STACK_DX = 40;
const STACK_DY = 56;
/** Rearmost card's opacity. The ramp between it and the front is derived, not
 *  authored, so changing the card count still reads as depth. */
const STACK_BACK_OPACITY = 0.25;

// Static twin of the desktop step-6 signal stack (./signal-stack): one failure,
// caught on five separate runs.
//
// Deliberately stops there — no collapse and no cluster pill. Mobile has no
// scroll to scrub the transition against, and the pill's entrance is the FIRST
// beat of the clusters section immediately below, where it falls in and lands.
// Showing it here too would spend it twice.
const SignalStackStatic = () => {
  const count = SIGNAL_CLUSTER_EVENT_COUNT;
  // Back to front, so the real card is painted last and lands on top.
  const ghosts = Array.from({ length: count - 1 }, (_, i) => count - 1 - i);

  return (
    // Ghosts are absolute and contribute no height, so the margin is what gives
    // the cascade the room it would otherwise be clipped out of.
    <div className="relative shrink-0 mx-auto" style={{ width: 600, marginBottom: (count - 1) * STACK_DY }}>
      {ghosts.map((slot) => (
        <div
          key={slot}
          aria-hidden
          className="absolute inset-0"
          style={{ transform: `translate(${slot * STACK_DX}px, ${slot * STACK_DY}px)` }}
        >
          {/* Opaque plate UNDER a faded card, never a faded card on its own:
              fading the whole thing lets the card behind show through it, which
              reads as stacked glass instead of depth. Same trick as desktop. */}
          <div className="absolute inset-0 rounded-md bg-surface-400" />
          <div className="absolute inset-0" style={{ opacity: 1 - (slot / (count - 1)) * (1 - STACK_BACK_OPACITY) }}>
            <SignalEventCard className="h-full" />
          </div>
        </div>
      ))}
      {/* The front card, and the one that gives the container its height.
          It needs the SAME opaque plate as the ghosts — the card's own fill is
          12% blue, so without one the card behind reads straight through it.
          `relative` is load-bearing too: the ghosts are positioned and CSS
          paints every positioned box above every in-flow one whatever the DOM
          order says, so without it the stack renders inside out. */}
      <div className="relative">
        <div className="absolute inset-0 rounded-md bg-surface-400" />
        <SignalEventCard className="relative" />
      </div>
    </div>
  );
};

const Copy = ({ step }: { step: StepNumber }) => {
  const config = STEPS[step];
  return (
    <div className="flex flex-col gap-3 items-start">
      {config.label && <span className={microLabel}>{config.label}</span>}
      {config.title && <h2 className={subSection}>{config.title}</h2>}
      {config.subtitle && <h3 className={subSubSection}>{config.subtitle}</h3>}
      <p className={bodyMedium}>{config.body}</p>
    </div>
  );
};

const Block = ({ step, children }: { step: StepNumber; children?: ReactNode }) => (
  <div className="flex flex-col gap-6 items-start w-full">
    <Copy step={step} />
    {children}
  </div>
);

// Centring pattern shared by the image panels: `flex` + `mx-auto shrink-0`
// centres the card when there's room and lets it overflow when there isn't.
//
// `footnote` overrides the step's own only where a step owns two panels and the
// second shows something the step's footnote does not name.
const Panel = ({
  step,
  footnote,
  className,
  children,
}: {
  step: StepNumber;
  footnote?: { name: string; href: string };
  className?: string;
  children: ReactNode;
}) => {
  const { name, href } = footnote ?? STEPS[step].footnote;
  return (
    <div className={cn("bg-surface-500 relative w-full overflow-hidden", className)}>
      {children}
      <SectionFootnote name={name} href={href} />
    </div>
  );
};

const UnderstandWhyTraceViewMobile = () => {
  // Scroll-driven Y shift so the transcript card breathes as it passes through.
  const transcriptRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: transcriptRef, offset: ["start end", "end start"] });
  const transcriptY = useTransform(scrollYProgress, [0, 1], [-120, -360]);

  return (
    <section className="w-full flex flex-col gap-16 px-6 py-16">
      {/* 01. Section opener — headline only. */}
      <Block step={1} />

      {/* Transcript */}
      <Block step={2}>
        <Panel step={2} className="h-[360px]">
          <div ref={transcriptRef} className="absolute inset-0 flex px-8">
            <div
              className="border-[0.5px] border-surface-400 rounded-lg overflow-hidden shrink-0 mx-auto h-full"
              style={{ width: 480 }}
            >
              <motion.img
                src="/assets/landing/composable-trace/transcript-v2.png"
                alt="Trace transcript"
                style={{ y: transcriptY, width: 480 }}
                className="pointer-events-none select-none"
              />
            </div>
            <div className="absolute top-0 left-0 right-0 h-[40px] bg-gradient-to-b from-surface-500/80 to-transparent pointer-events-none z-10" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[160px] bg-gradient-to-t from-surface-500 to-transparent pointer-events-none z-10" />
        </Panel>

        {/* Second panel under the same copy, which promises both a transcript
            and a timeline. */}
        <Panel step={2} footnote={TIMELINE_FOOTNOTE} className="h-[280px] flex items-center px-5 pb-8">
          {/* 650×250 source, scaled 1:1 — a mismatched box would crop the axis
              labels off the top and the controls off the right. */}
          <div
            className="border-[0.5px] border-surface-400 rounded-lg overflow-hidden shrink-0 mx-auto relative"
            style={{ width: 585, height: 225 }}
          >
            <Image
              src="/assets/landing/composable-trace/timeline-v2.png"
              alt="Condensed trace timeline"
              fill
              sizes="585px"
              className="object-cover pointer-events-none select-none"
            />
          </div>
        </Panel>
      </Block>

      {/* 02. Signals — the detection, then the Slack ping the copy promises. */}
      <Block step={3}>
        <Panel step={3} className="px-5 pt-4 pb-12 flex flex-col gap-3">
          <SignalEventCard className="w-[600px] max-w-[600px] shrink-0" />
          <SlackNotificationCard className="w-[600px] max-w-[600px] shrink-0" />
        </Panel>
      </Block>

      {/* The same signal, matched on run after run. */}
      <Block step={4}>
        <Panel step={4} className="px-5 pt-4 pb-12">
          <SignalStackStatic />
        </Panel>
      </Block>
    </section>
  );
};

export default UnderstandWhyTraceViewMobile;
