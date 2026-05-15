"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";

import { bodyMedium, subSection } from "../../class-names";
import LearnMoreLink from "../learn-more-link";
import SignalEventCard from "../signal-event-card";
import SlackNotificationCard from "../slack-notification-card";

// Trace transcript image (480px wide). Scroll-driven Y offset gives the card
// a parallax feel as it passes through the viewport.
const TRANSCRIPT_W = 480;

// Ask-AI screenshot dimensions. The image is 1x retina-sized; scaled down to
// 480px via the inline width.
const ASK_AI_W = 480;
const ASK_AI_H = 491;

interface BlockProps {
  title: string;
  description?: string;
  learnMore: { label: string; href: string };
  children: React.ReactNode;
}

const Block = ({ title, description, learnMore, children }: BlockProps) => (
  <div className="flex flex-col gap-6 items-start w-full">
    <div className="flex flex-col gap-3 items-start">
      <h2 className={subSection}>{title}</h2>
      {description && <p className={bodyMedium}>{description}</p>}
    </div>
    {children}
    <LearnMoreLink {...learnMore} />
  </div>
);

const TranscriptCard = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [-120, -360]);

  return (
    <div
      ref={ref}
      className="bg-landing-surface-700 border-[0.5px] border-landing-surface-400 rounded-lg overflow-hidden h-[413px] w-full flex flex-col gap-5 items-start justify-end px-5 py-4 relative"
    >
      <div
        className="border-[0.5px] border-landing-surface-500 rounded-lg overflow-hidden shrink-0 bottom-0 absolute h-full"
        style={{ width: TRANSCRIPT_W }}
      >
        <motion.img
          src="/assets/landing/composable-trace/transcript-v2.png"
          alt="Trace transcript"
          style={{ y, width: TRANSCRIPT_W }}
          className="pointer-events-none select-none"
        />
      </div>
      <div className="flex flex-col gap-1 relative z-10 w-full">
        <p className="font-space-grotesk text-[22px] leading-7 text-landing-text-100 tracking-[-0.22px]">Transcript</p>
        <p className="font-sans text-sm leading-5 text-landing-text-300 tracking-[-0.14px]">
          A clear view of messages, tool calls, and sub-agents
        </p>
      </div>
      <div className="absolute top-0 left-0 right-0 h-[61px] bg-gradient-to-b from-landing-surface-700 to-transparent pointer-events-none z-20" />
      <div className="absolute bottom-0 left-0 right-0 h-[200px] bg-gradient-to-t from-landing-surface-700 from-50% to-transparent pointer-events-none z-5" />
    </div>
  );
};

const UnderstandWhyTraceViewMobile = () => (
  <section className="w-full flex flex-col gap-16 px-6 py-16">
    <Block
      title={"Get alerts when\nyour agent breaks."}
      learnMore={{ label: "Learn more about notifications", href: "https://laminar.sh/docs/signals" }}
    >
      {/* Mock is wider than a typical phone viewport — overflows past the right
          edge intentionally so the card reads at full scale. Page root has
          `overflow-x-clip` so this doesn't cause horizontal scroll. */}
      <SlackNotificationCard className="w-[600px] max-w-[600px] shrink-0" />
    </Block>

    <Block
      title={"Understand why\nin seconds."}
      learnMore={{ label: "Learn more about Signals", href: "https://laminar.sh/docs/signals" }}
    >
      <SignalEventCard className="w-[600px] max-w-[600px] shrink-0" />
    </Block>

    <Block
      title={"A clear, concise view\nof your agent run."}
      learnMore={{ label: "Learn more about trace view", href: "https://laminar.sh/docs/tracing" }}
    >
      <div className="flex flex-col gap-8 w-full">
        <div className="bg-landing-surface-700 border-[0.5px] border-landing-surface-400 rounded-lg overflow-hidden h-[180px] w-full flex flex-col justify-end relative">
          <div className="absolute top-0 left-0 w-full h-full">
            <Image
              src="/assets/landing/composable-trace/timeline-v2.png"
              alt="Trace timeline"
              fill
              className="object-contain object-top pointer-events-none select-none"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-landing-surface-700 from-[54%] to-transparent pointer-events-none" />
          <div className="flex flex-col gap-1 px-5 py-4 relative z-10">
            <p className="font-space-grotesk text-[22px] leading-7 text-landing-text-100 tracking-[-0.22px]">
              Timeline
            </p>
            <p className="font-sans text-sm leading-5 text-landing-text-300 tracking-[-0.14px]">
              Visualize duration, cost, and structure
            </p>
          </div>
        </div>

        <TranscriptCard />

        <div className="bg-landing-surface-700 border-[0.5px] border-landing-surface-400 rounded-lg overflow-hidden h-[310px] w-full flex flex-col gap-5 items-end justify-end px-5 py-4 relative">
          <div
            className="border-[0.5px] border-landing-surface-400 rounded-lg overflow-hidden shrink-0 relative"
            style={{ width: ASK_AI_W, height: ASK_AI_H }}
          >
            <Image
              src="/assets/landing/composable-trace/ask-ai-v2.png"
              alt="Ask AI"
              fill
              sizes={`${ASK_AI_W}px`}
              className="object-cover object-left-top pointer-events-none select-none"
            />
          </div>
          <div className="flex flex-col gap-1 relative z-10 w-full">
            <p className="font-space-grotesk text-[22px] leading-7 text-landing-text-100 tracking-[-0.22px]">Ask AI</p>
            <p className="font-sans text-sm leading-5 text-landing-text-300 tracking-[-0.14px]">
              Summarize, debug, or analyze any trace with AI
            </p>
          </div>
          <div className="absolute top-0 left-0 right-0 h-[61px] bg-gradient-to-b from-landing-surface-700 to-transparent pointer-events-none z-20" />
        </div>
      </div>
    </Block>
  </section>
);

export default UnderstandWhyTraceViewMobile;
