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
const MOBILE_HREF_SIGNALS = "https://laminar.sh/docs/signals";
const MOBILE_HREF_TRACE = "https://laminar.sh/docs/tracing";

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
      {/* 01. Notifications */}
      <div className="flex flex-col gap-6 items-start w-full">
        <div className="flex flex-col gap-3 items-start">
          <span className={microLabel}>01.</span>
          <h2 className={subSection}>{"Get alerts when\nyour agent breaks."}</h2>
          <p className={bodyMedium}>
            Describe what you want to track in plain English. Laminar analyzes traces of your agent and pings you in
            Slack the moment a trace matches.
          </p>
        </div>
        <div className="bg-landing-surface-550 relative w-full overflow-hidden h-[280px] px-5 py-4 flex flex-col justify-center">
          <SlackNotificationCard className="w-[600px] max-w-[600px] shrink-0" />
          <SectionFootnote name="Notifications" href={MOBILE_HREF_SIGNALS} />
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
          <SectionFootnote name="Trace view" href={MOBILE_HREF_TRACE} />
        </div>
      </div>

      {/* Transcript — clear, concise view of your agent run */}
      <div className="flex flex-col gap-6 items-start w-full">
        <div className="flex flex-col gap-3 items-start">
          <h3 className={subSubSection}>Clear, concise view of your agent run</h3>
          <p className={bodyMedium}>
            Laminar makes the agent run navigable by surfacing input, LLM reasoning, tool calls, and sub-agents as a
            readable transcript.
          </p>
        </div>
        <div className="bg-landing-surface-550 relative w-full overflow-hidden h-[360px]">
          <div ref={transcriptRef} className="absolute inset-0">
            <div
              className="border-[0.5px] border-landing-surface-500 rounded-lg overflow-hidden shrink-0 absolute left-8 bottom-0 h-full"
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
          <SectionFootnote name="Transcript" href={MOBILE_HREF_TRACE} />
        </div>
      </div>

      {/* Ask AI — image shrunk to 80% origin bottom-right with extra right
          padding so the mock has breathing room and doesn't crash into the
          footnote at the bottom. */}
      <div className="flex flex-col gap-6 items-start w-full">
        <div className="flex flex-col gap-3 items-start">
          <h3 className={subSubSection}>Long complex run? Chat with AI</h3>
          <p className={bodyMedium}>
            Ask any question, dive deep into any agent run. Click span references to jump straight into context.
          </p>
        </div>
        <div className="bg-landing-surface-550 relative w-full overflow-hidden h-[360px] flex flex-col items-end justify-end pt-4 pr-8 pb-12">
          <div
            className="border-[0.5px] border-landing-surface-400 rounded-lg overflow-hidden shrink-0 relative origin-bottom-right scale-80"
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
          <SectionFootnote name="Ask AI" href={MOBILE_HREF_TRACE} />
        </div>
      </div>
    </section>
  );
};

export default UnderstandWhyTraceViewMobile;
