"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRef } from "react";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const AskAIImage = ({ className }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // All transforms at top level (hooks can't be in callbacks)
  const opacity1 = useTransform(scrollYProgress, [0.0, 0.2], [0, 1]);
  const x1 = useTransform(scrollYProgress, [0.0, 0.3], [100 + 360, 360]);

  const opacity2 = useTransform(scrollYProgress, [0.1, 0.3], [0, 1]);
  const x2 = useTransform(scrollYProgress, [0.1, 0.4], [100 + 400, 400]);

  const opacity3 = useTransform(scrollYProgress, [0.2, 0.5], [0, 1]);
  const x3 = useTransform(scrollYProgress, [0.2, 0.6], [100 + 440, 440]);

  const opacity4 = useTransform(scrollYProgress, [0, 0.3], [0, 1]);
  const x4 = useTransform(scrollYProgress, [0.2, 0.4], [-40, 0]);

  // Messages data with references to pre-computed transforms
  const messages = [
    { text: "Explain the error that's happening", hasButton: false, opacity: opacity1, x: x1 },
    { text: "Diagnose the core cause of the issue", hasButton: false, opacity: opacity2, x: x2 },
    { text: "Summarize my trace for me and explain the root cause of the error", hasButton: false, opacity: opacity3, x: x3 },
    { text: "Summarize my trace for me and explain the root cause of the error", hasButton: true, opacity: opacity4, x: x4 },
  ];

  return (
    <div ref={containerRef} className={cn(
      "bg-landing-surface-700 overflow-clip rounded-lg relative md:p-8",
      "p-6",
      className
    )}>
      <div className={cn(
        "bg-landing-surface-600 border border-landing-surface-400 flex flex-col items-end justify-end rounded w-[685px] absolute md:gap-4 md:px-7 md:py-5 md:right-[100px] md:-top-[10px]",
        "gap-3 px-5 py-4 right-[80px] -top-[8px]"
      )}>
        {messages.map((message, index) => (
          <motion.div
            key={index}
            className={cn(
              "bg-landing-surface-500 border border-landing-surface-400 flex items-center rounded-lg w-[593px] md:gap-[14px] md:pl-3 md:pr-2 md:py-2",
              "gap-2 pl-2 pr-1.5 py-1.5"
            )}
            style={{
              opacity: message.opacity,
              x: message.x,
            }}
          >
            <p className={cn(
              "flex-1 text-landing-text-500 md:text-base md:leading-[22px]",
              "text-sm leading-[18px]"
            )}>{message.text}</p>
            {message.hasButton && (
              <div className={cn(
                "bg-landing-primary-400-10 border border-landing-primary-400-50 flex items-center justify-center rounded shrink-0 md:p-2",
                "p-1.5"
              )}>
                <ArrowRight className="w-4 h-4 text-landing-primary-400" />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Gradient fade on bottom */}
      <div className="absolute bottom-0 left-0 w-full h-[60%] bg-gradient-to-t from-landing-surface-700 to-transparent" />
    </div>
  );
};

export default AskAIImage;
