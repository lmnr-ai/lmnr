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

  // Messages data with unique properties
  const messages = [
    {
      text: "Explain the error that's happening",
      xOffset: 360,
      hasButton: false,
      opacity: useTransform(scrollYProgress, [0.0, 0.2], [0, 1]),
      x: useTransform(scrollYProgress, [0.0, 0.3], [100, 0]),
    },
    {
      text: "Diagnose the core cause of the issue",
      xOffset: 400,
      hasButton: false,
      opacity: useTransform(scrollYProgress, [0.1, 0.3], [0, 1]),
      x: useTransform(scrollYProgress, [0.1, 0.4], [100, 0]),
    },
    {
      text: "Summarize my trace for me and explain the root cause of the error",
      xOffset: 440,
      hasButton: false,
      opacity: useTransform(scrollYProgress, [0.2, 0.5], [0, 1]),
      x: useTransform(scrollYProgress, [0.2, 0.6], [100, 0]),
    },
    {
      text: "Summarize my trace for me and explain the root cause of the error",
      xOffset: 0,
      hasButton: true,
      opacity: useTransform(scrollYProgress, [0, 0.3], [0, 1]),
      x: useTransform(scrollYProgress, [0.2, 0.4], [-40, 0]),
    },
  ];

  return (
    <div ref={containerRef} className={cn("bg-landing-surface-700 overflow-clip p-8 rounded-lg relative", className)}>
      <div className="bg-landing-surface-600 border border-landing-surface-400 flex flex-col gap-4 items-end justify-end px-7 py-5 rounded w-[685px] absolute right-[100px] -top-[10px]">
        {messages.map((message, index) => (
          <motion.div
            key={index}
            className={cn(
              "bg-landing-surface-500 border border-landing-surface-400 flex gap-[14px] items-center pl-3 pr-2 py-2 rounded-lg w-[593px]"
            )}
            style={{
              opacity: message.opacity,
              x: useTransform(message.x, (val) => val + message.xOffset),
            }}
          >
            <p className="flex-1 text-base leading-[22px] text-landing-text-500">{message.text}</p>
            {message.hasButton && (
              <div className="bg-landing-primary-400-10 border border-landing-primary-400-50 flex items-center justify-center p-2 rounded shrink-0">
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
