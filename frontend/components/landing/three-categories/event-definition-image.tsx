"use client";

import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const EventDefinitionImage = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center start"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.8, 1]);

  // Full definition text
  const fullText = `This event happens when there's a definitive evidence that current trace of an LLM powered application contains logical error that stems from the incorrect logical steps produced by an LLM. \n\nExamples of it might be deep flaws in the execution logic, suboptimal tool calls and failures to fully follow and adhere to the original prompt.`;

  // Transform scroll progress to character count
  const visibleChars = useTransform(scrollYProgress, [0, 1], [0, fullText.length]);

  // State to hold the visible text
  const [displayText, setDisplayText] = useState("");

  // Subscribe to character count changes and update displayed text
  useMotionValueEvent(visibleChars, "change", (latest) => {
    const charCount = Math.round(latest);
    setDisplayText(fullText.slice(0, charCount));
  });

  return (
    <motion.div
      className={cn("bg-landing-surface-700 overflow-hidden relative rounded-sm", className)}
      style={{ opacity }}
      ref={ref}
    >
      <div
        className={cn(
          "absolute bg-landing-surface-600 border border-landing-surface-400 flex flex-col items-start justify-center rounded-sm w-[1179px] md:left-[72px] md:top-[53px] md:gap-3 md:px-6 md:py-4",
          "left-[52px] top-[32px] gap-2 px-4 py-3"
        )}
      >
        {/* Title */}
        <p className={cn(
          "font-sans font-medium leading-normal text-landing-text-300 whitespace-nowrap shrink-0 md:text-[20px]",
          "text-[16px]"
        )}>
          LLM_logic_error
        </p>

        {/* Definition Section */}
        <div className={cn(
          "flex flex-col items-start relative shrink-0 w-full md:gap-2",
          "gap-1.5"
        )}>
          <p className={cn(
            "font-sans font-normal leading-normal text-landing-text-300 whitespace-nowrap shrink-0 md:text-base",
            "text-sm"
          )}>
            Definition
          </p>
          <div className={cn(
            "bg-landing-primary-400/10 border border-landing-primary-400/50 flex items-center justify-center rounded-sm shrink-0 w-full md:px-3 md:py-2",
            "px-2 py-1.5"
          )}>
            <p className={cn(
              "basis-0 font-sans font-normal grow min-h-px min-w-px relative shrink-0 text-landing-primary-400 whitespace-pre-wrap md:leading-[22px] md:text-base",
              "leading-[18px] text-sm"
            )}>
              {displayText}
            </p>
          </div>
        </div>

        {/* Structured Output Section */}
        <div className={cn(
          "flex flex-col items-start relative shrink-0 w-full md:gap-2",
          "gap-1.5"
        )}>
          <p className={cn(
            "font-sans font-normal leading-normal text-landing-text-300 whitespace-nowrap shrink-0 md:text-base",
            "text-sm"
          )}>
            Structured Output
          </p>
          <div className={cn(
            "bg-landing-surface-500 border border-landing-text-600 flex font-mono items-start leading-normal overflow-hidden rounded-sm text-nowrap w-full md:gap-[14px] md:px-2 md:py-1 md:text-base",
            "gap-2 px-1.5 py-0.5 text-xs"
          )}>
            {/* Line Numbers */}
            <div className="leading-normal relative shrink-0 text-right text-landing-text-500">
              <p className="mb-0">1</p>
              <p className="mb-0">2</p>
              <p className="mb-0">3</p>
              <p className="mb-0">4</p>
              <p className="mb-0">5</p>
              <p className="mb-0">6</p>
              <p className="mb-0">7</p>
              <p className="mb-0">8</p>
              <p className="mb-0">9</p>
              <p className="mb-0">10</p>
              <p className="mb-0">11</p>
              <p className="mb-0">12</p>
              <p className="mb-0">13</p>
              <p className="mb-0">14</p>
              <p className="mb-0">15</p>
              <p className="mb-0">16</p>
              <p>17</p>
            </div>
            {/* JSON Code */}
            <div className="leading-normal shrink-0 text-landing-text-500">
              <p className="mb-0">{`{`}</p>
              <p className="mb-0">{`  "type": "object",`}</p>
              <p className="mb-0">{`  "required": [`}</p>
              <p className="mb-0">{`    "analysis",`}</p>
              <p className="mb-0">{`    "preview"`}</p>
              <p className="mb-0">{`  ],`}</p>
              <p className="mb-0">{`  "properties": {`}</p>
              <p className="mb-0">{`    "preview": {`}</p>
              <p className="mb-0">{`      "type": "string",`}</p>
              <p className="mb-0">{`      "description": "Single sentence to summarize why this trace needs attention. This should not convey trace specific details, but rather high level overview of core error or flaw."`}</p>
              <p className="mb-0">{`    },`}</p>
              <p className="mb-0">{`    "analysis": {`}</p>
              <p className="mb-0">{`      "type": "string",`}</p>
              <p className="mb-0">{`      "description": "Description of why do you think there's a logical error present in the trace, with proper references to the spans where relevant."`}</p>
              <p className="mb-0">{`    }`}</p>
              <p className="mb-0">{`  }`}</p>
              <p>{`}`}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gradient overlay at bottom left */}
      <div className="absolute bottom-0 left-0 flex h-[80%] items-center justify-center w-full bg-gradient-to-t from-landing-surface-700  to-landing-surface-700/0" />
    </motion.div>
  );
};

export default EventDefinitionImage;
