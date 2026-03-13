"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";

const REPORT_SIGNALS = [
  { name: "Browser errors", events: 11 },
  { name: "Slow tasks and optimization", events: 246 },
  { name: "Server startup errors", events: 94 },
];

interface Props {
  progress: MotionValue<number>;
}

const ReportsPanel = ({ progress }: Props) => {
  const slackOpacity = useTransform(progress, [0.4, 0.7], [0, 1]);
  const slackY = useTransform(progress, [0.4, 0.7], [20, 0]);
  const emailOpacity = useTransform(progress, [0.4, 0.7], [1, 0.6]);

  return (
    <div className="relative w-full h-[80%]">
      {/* Email report card */}
      <motion.div
        style={{ opacity: emailOpacity }}
        className="bg-[#1b1b1c] border border-[#2e2e2f] flex flex-col items-start overflow-hidden rounded w-full h-full"
      >
        {/* Email header */}
        <div className="bg-[rgba(37,37,38,0.5)] flex items-center px-4 md:px-6 py-2 w-full">
          <p className="font-sans text-xs text-landing-text-500 whitespace-nowrap">from: reports@mail.lmnr.ai</p>
        </div>

        {/* Email body */}
        <div className="border-t border-[#2e2e2f] flex flex-col gap-4 md:gap-6 items-start pb-4 md:pb-5 pt-3 md:pt-3.5 px-4 md:px-6 w-full relative">
          {/* Title + Total events */}
          <div className="flex flex-col gap-1 items-start text-landing-text-300 w-full whitespace-nowrap">
            <div className="flex items-end justify-between w-full">
              <p className="font-sans font-medium text-base md:text-xl">Signals Report</p>
              <div className="flex flex-col items-end justify-center w-[200px] md:w-[240px]">
                <p className="font-sans text-[10px] md:text-xs">Total events</p>
                <p className="font-sans font-medium text-base md:text-xl">365</p>
              </div>
            </div>
            <div className="font-sans text-[10px] md:text-xs">
              <p className="mb-0">AI Startup · Signals Events Summary</p>
              <p>Mar 06, 2026 - Mar 13, 2026</p>
            </div>
          </div>

          {/* My Agent section */}
          <div className="flex flex-col gap-2 items-start w-full">
            <p className="font-sans font-medium text-sm md:text-base text-landing-text-300 whitespace-nowrap">
              My Agent
            </p>

            {/* Signals table */}
            <div className="bg-[rgba(37,37,38,0.5)] border border-landing-surface-400 flex flex-col items-start overflow-hidden rounded w-full">
              {/* Table header */}
              <div className="border-b border-landing-surface-400 flex items-start px-3 md:px-4 w-full">
                <div className="flex flex-1 items-center min-w-0 py-1 md:py-1.5">
                  <p className="font-sans text-[10px] md:text-xs text-landing-text-300">Signal</p>
                </div>
                <div className="flex items-center py-1 md:py-1.5 shrink-0">
                  <p className="font-sans text-[10px] md:text-xs text-landing-text-300">Events</p>
                </div>
              </div>
              {/* Table rows */}
              {REPORT_SIGNALS.map((signal, i) => (
                <div
                  key={i}
                  className="border-b border-landing-surface-400 last:border-b-0 flex items-start px-3 md:px-4 w-full"
                >
                  <div className="flex flex-1 items-center min-w-0 py-1.5 md:py-2">
                    <p className="font-sans text-xs md:text-base text-landing-text-300 whitespace-nowrap">
                      {signal.name}
                    </p>
                  </div>
                  <div className="flex items-center py-1.5 md:py-2 shrink-0">
                    <p className="font-sans text-xs md:text-base text-landing-text-300 whitespace-nowrap">
                      {signal.events}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="bg-[rgba(37,37,38,0.5)] border border-landing-surface-400 flex flex-col gap-2 items-start overflow-hidden px-3 md:px-4 py-2.5 md:py-3 rounded w-full">
              <p className="font-sans text-[10px] md:text-xs text-landing-text-300 whitespace-nowrap">Summary</p>
              <p className="font-sans text-[10px] md:text-xs text-landing-text-300">
                The agent frequently performs inefficient sequential edits on dozens of files instead of using scripted
                automation, leading to high latency and redundant tool calls. Sandbox environments often require manual
                Git authentication and dependency setup.
              </p>
            </div>
          </div>

          {/* Gradient overlay fading bottom of email */}
          <div className="absolute bottom-0 left-0 w-full h-[70%] bg-gradient-to-b from-transparent via-[rgba(22,22,23,0.5)] to-landing-surface-700 pointer-events-none" />
        </div>
      </motion.div>

      {/* Slack notification card */}
      <motion.div
        style={{
          opacity: slackOpacity,
          y: slackY,
          background:
            "linear-gradient(90deg, rgba(37, 37, 38, 0.8) 0%, rgba(37, 37, 38, 0.8) 100%), linear-gradient(90deg, rgb(27, 27, 28) 0%, rgb(27, 27, 28) 100%)",
        }}
        className="absolute left-[100px] md:left-[146px] top-[160px] md:top-[210px] w-[320px] md:w-[395px] border border-landing-surface-400 flex gap-2.5 md:gap-3 items-start overflow-hidden px-3 md:px-4 py-2.5 md:py-3 rounded z-10"
      >
        {/* Laminar icon */}
        <div className="shrink-0 size-6 md:size-8 bg-landing-surface-700 rounded flex items-center justify-center">
          <svg width="60" height="60" viewBox="0 0 76 76" fill="none" className="size-3.5 md:size-5">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M1.32507 73.4886C0.00220402 72.0863 0.0802819 69.9867 0.653968 68.1462C3.57273 58.7824 5.14534 48.8249 5.14534 38.5C5.14534 27.8899 3.48464 17.6677 0.408998 8.0791C-0.129499 6.40029 -0.266346 4.50696 0.811824 3.11199C2.27491 1.21902 4.56777 0 7.14535 0H37.1454C58.1322 0 75.1454 17.0132 75.1454 38C75.1454 58.9868 58.1322 76 37.1454 76H7.14535C4.85185 76 2.78376 75.0349 1.32507 73.4886Z"
              fill="var(--color-landing-text-400)"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-1 items-start justify-center min-w-0">
          <div className="flex items-start justify-between w-full whitespace-nowrap font-sans text-[10px] md:text-xs">
            <p className="text-landing-text-200">Laminar</p>
            <p className="text-landing-text-300">3:18 pm</p>
          </div>
          <div className="flex gap-1 items-start w-full">
            <p className="font-sans text-[10px] md:text-xs text-landing-text-400 whitespace-nowrap">Event:</p>
            <div className="bg-landing-surface-600 flex items-center justify-center px-2 rounded shrink-0">
              <p className="font-sans text-[10px] md:text-xs text-[rgba(208,117,78,0.6)] whitespace-nowrap">
                Agent failure
              </p>
            </div>
          </div>
          <div className="flex gap-1 items-start w-full">
            <p className="font-sans text-[10px] md:text-xs text-landing-text-400 whitespace-nowrap">Category:</p>
            <div className="bg-landing-surface-600 flex items-center justify-center px-2 rounded shrink-0">
              <p className="font-sans text-[10px] md:text-xs text-[rgba(208,117,78,0.6)] whitespace-nowrap">
                logic_error
              </p>
            </div>
          </div>
          <p className="font-sans text-[10px] md:text-xs text-landing-text-400 w-full">
            Description:
            <br />
            {`The LLM in the 'refine_report' task failed to follow the instruction to keep the summary to 3-4 sentences,.`}
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default ReportsPanel;
