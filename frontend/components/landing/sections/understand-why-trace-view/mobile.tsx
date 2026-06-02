"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";

import { bodyMedium, microLabel, subSection, subSubSection } from "../../class-names";
import SectionFootnote from "../section-footnote";
import SignalEventCard from "../signal-event-card";
import SlackNotificationCard from "../slack-notification-card";

// Mock card widths intentionally overflow the typical phone viewport — the
// page root has `overflow-x-clip` so the visuals read at full scale without
// causing horizontal scroll.
const UnderstandWhyTraceViewMobile = () => {
  // Parallax for the transcript image — scroll-driven Y shift so the card
  // breathes as it passes through the viewport.
  const transcriptRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: transcriptProgress } = useScroll({
    target: transcriptRef,
    offset: ["start end", "end start"],
  });
  const transcriptY = useTransform(transcriptProgress, [0, 1], [-120, -360]);

  return (
    <section className="w-full flex flex-col gap-16 px-6 py-16">
      {/* 01. Signals */}
      <div className="flex flex-col gap-6 items-start w-full">
        <div className="flex flex-col gap-3 items-start">
          <span className={microLabel}>01.</span>
          <h2 className={subSection}>{"Get alerts when\nyour agent breaks."}</h2>
          <p className={bodyMedium}>
            {
              'Signals let you describe the error in plain English – "agent is stuck in a loop". Laminar reads every agent run and pings you in Slack when it happens.'
            }
          </p>
        </div>
        <div className="bg-landing-surface-550 relative w-full overflow-hidden h-[280px] px-5 py-4 flex flex-col justify-center">
          <SlackNotificationCard className="w-[600px] max-w-[600px] shrink-0" />
          <SectionFootnote name="Signals" href="https://laminar.sh/docs/signals/introduction" />
        </div>
      </div>

      {/* 02. Trace view — signal event */}
      <div className="flex flex-col gap-6 items-start w-full">
        <div className="flex flex-col gap-3 items-start">
          <span className={microLabel}>02.</span>
          <h2 className={subSection}>{"Understand why\nin seconds."}</h2>
          <p className={bodyMedium}>{"Go from issue description to the\nexact step that caused it."}</p>
        </div>
        <div className="bg-landing-surface-550 relative w-full overflow-hidden h-[280px] px-5 py-4 flex flex-col justify-center">
          <SignalEventCard className="w-[600px] max-w-[600px] shrink-0" />
          <SectionFootnote name="Signals" href="https://laminar.sh/docs/signals/introduction" />
        </div>
      </div>

      {/* Transcript — clear, concise view of your agent run */}
      <div className="flex flex-col gap-6 items-start w-full">
        <div className="flex flex-col gap-3 items-start">
          <h3 className={subSubSection}>A clear, concise view of your agent run</h3>
          <p className={bodyMedium}>
            Laminar makes the agent run easily navigable by surfacing input, LLM reasoning, tool calls, and sub-agents
            in a readable transcript and timeline.
          </p>
        </div>
        <div className="bg-landing-surface-550 relative w-full overflow-hidden h-[360px]">
          {/* Centering pattern (see has-this-issue): flex + `mx-auto shrink-0`
              centers the card when there's room and left-overflows when not. */}
          <div ref={transcriptRef} className="absolute inset-0 flex px-8">
            <div
              className="border-[0.5px] border-landing-surface-500 rounded-lg overflow-hidden shrink-0 mx-auto h-full"
              style={{ width: 480 }}
            >
              <motion.img
                src="/assets/landing/composable-trace/transcript-v2.png"
                alt="Trace transcript"
                style={{ y: transcriptY, width: 480 }}
                className="pointer-events-none select-none"
              />
            </div>
            <div className="absolute top-0 left-0 right-0 h-[40px] bg-gradient-to-b from-landing-surface-550/80 to-transparent pointer-events-none z-10" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[160px] bg-gradient-to-t from-landing-surface-550 to-transparent pointer-events-none z-10" />
          <SectionFootnote name="Transcript view" href="https://laminar.sh/docs/platform/viewing-traces" />
        </div>
      </div>

      {/* Ask AI — centering pattern: `flex items-end justify-end` + `mx-auto
          shrink-0` centers the card when there's room and right-overflows
          when there isn't (mx-auto wins when there's slack; justify-end takes
          over when there isn't). `origin-bottom-right scale-80` keeps the
          card bottom-right-anchored as it shrinks. */}
      <div className="flex flex-col gap-6 items-start w-full">
        <div className="flex flex-col gap-3 items-start">
          <h3 className={subSubSection}>Ask any question about your agent run</h3>
          <p className={bodyMedium}>
            Dive deep into any issue within the agent run by simply asking. Get answers that reference specific context
            that you can jump to directly.
          </p>
        </div>
        <div className="bg-landing-surface-550 relative w-full overflow-hidden h-[360px] flex items-end justify-end px-8 pt-4 pb-12">
          <div
            className="border-[0.5px] border-landing-surface-400 rounded-lg overflow-hidden shrink-0 mx-auto relative origin-bottom-right scale-80"
            style={{ width: 480, height: 491 }}
          >
            <Image
              src="/assets/landing/composable-trace/ask-ai-v2.png"
              alt="Ask AI"
              fill
              sizes="480px"
              className="object-cover object-right-bottom pointer-events-none select-none"
            />
          </div>
          <div className="absolute top-0 left-0 right-0 h-[40px] bg-gradient-to-b from-landing-surface-550/80 to-transparent pointer-events-none z-10" />
          <SectionFootnote name="Ask AI" href="https://laminar.sh/docs/platform/viewing-traces#chat-with-trace" />
        </div>
      </div>
    </section>
  );
};

export default UnderstandWhyTraceViewMobile;
