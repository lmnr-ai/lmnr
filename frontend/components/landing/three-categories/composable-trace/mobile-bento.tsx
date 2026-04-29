"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const TRANSCRIPT_DISPLAY_W = 480;

const ASK_AI_DISPLAY_W = 480;
const ASK_AI_DISPLAY_H = 491;

const MobileBento = ({ className }: Props) => {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: transcriptProgress } = useScroll({
    target: transcriptRef,
    offset: ["start end", "end start"],
  });
  const transcriptY = useTransform(transcriptProgress, [0, 1], [-120, -360]);

  return (
    <div className={cn("flex flex-col gap-8 items-start w-full", className)}>
      {/* Timeline card */}
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
          <p className="font-space-grotesk text-[22px] leading-7 text-landing-text-100 tracking-[-0.22px]">Timeline</p>
          <p className="font-sans text-sm leading-5 text-landing-text-300 tracking-[-0.14px]">
            Visualize duration, cost, and structure
          </p>
        </div>
      </div>

      {/* Transcript card — items-start, justify-end. Wrapper height matches figma 372, larger than card content area
          so it overflows the top. Wrapper width = source image width (overflow on right). */}
      <div
        ref={transcriptRef}
        className="bg-landing-surface-700 border-[0.5px] border-landing-surface-400 rounded-lg overflow-hidden h-[413px] w-full flex flex-col gap-5 sm:items-center items-start justify-end px-5 py-4 relative"
      >
        <div
          className="border-[0.5px] border-landing-surface-500 rounded-lg overflow-hidden shrink-0 bottom-0 absolute h-full"
          style={{ width: TRANSCRIPT_DISPLAY_W }}
        >
          <motion.img
            src="/assets/landing/composable-trace/transcript-v2.png"
            alt="Trace transcript"
            style={{ y: transcriptY, width: TRANSCRIPT_DISPLAY_W }}
            sizes={`${TRANSCRIPT_DISPLAY_W}px`}
            className="pointer-events-none select-none"
          />
        </div>
        <div className="flex flex-col gap-1 relative z-10 w-full">
          <p className="font-space-grotesk text-[22px] leading-7 text-landing-text-100 tracking-[-0.22px]">
            Transcript
          </p>
          <p className="font-sans text-sm leading-5 text-landing-text-300 tracking-[-0.14px]">
            Clear, concise view of messages, tool calls, and sub-agents
          </p>
        </div>
        <div className="absolute top-0 left-0 right-0 h-[61px] bg-gradient-to-b from-landing-surface-700 to-transparent pointer-events-none z-20" />
        <div className="absolute bottom-0 left-0 right-0 h-[200px] bg-gradient-to-t from-landing-surface-700 from-50% to-transparent pointer-events-none z-5" />
      </div>

      {/* Ask AI card — items-end, justify-end. Wrapper width = source image width (right-aligned, overflows left). */}
      <div className="bg-landing-surface-700 border-[0.5px] border-landing-surface-400 rounded-lg overflow-hidden h-[310px] w-full flex flex-col gap-5 items-end justify-end px-5 py-4 relative">
        <div
          className="border-[0.5px] border-landing-surface-400 rounded-lg overflow-hidden shrink-0 relative"
          style={{ width: ASK_AI_DISPLAY_W, height: ASK_AI_DISPLAY_H }}
        >
          <Image
            src="/assets/landing/composable-trace/ask-ai-v2.png"
            alt="Ask AI"
            fill
            sizes={`${ASK_AI_DISPLAY_W}px`}
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
  );
};

export default MobileBento;
