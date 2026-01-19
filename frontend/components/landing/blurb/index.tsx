"use client";

import { motion, type MotionValue, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

import { cn } from "@/lib/utils";

import { quoteAttributionName, quoteAttributionRole, quoteSize, quoteText } from "../class-names";

interface Props {
  className?: string;
}

interface AnimatedWordProps {
  word: string;
  wordIndex: number;
  totalWords: number;
  scrollYProgress: MotionValue<number>;
  addLineBreak?: boolean;
}

const AnimatedWord = ({ word, wordIndex, totalWords, scrollYProgress, addLineBreak }: AnimatedWordProps) => {
  const wordProgress = useTransform(scrollYProgress, (v) => 1.2 * v - wordIndex / totalWords - 0.1);

  const color = useTransform(wordProgress, (progress) => {
    if (progress < 0) return "var(--color-landing-text-400)";
    return "rgb(255 255 255)";
  });

  return (
    <>
      <motion.span style={{ color }}>{word} </motion.span>
      {addLineBreak && <br className="hidden md:inline" />}
    </>
  );
};

const Blurb = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start start"],
  });

  const text =
    "Laminar's evals help us maintain high accuracy while moving fast. We now use them for every LLM based feature we build.";
  const words = text.split(" ");
  const totalWords = words.length;

  return (
    <div className={cn("bg-landing-surface-900 flex flex-col items-center md:px-10 md:py-40", "px-4 py-30", className)}>
      <div className={cn("flex flex-col md:gap-[50px] items-center", "gap-8")} ref={ref}>
        <p className={cn(quoteText, quoteSize, "md:max-w-[840px]", "max-w-full")}>
          <span className="text-landing-primary-400">&ldquo;</span>
          {words.map((word, index) => (
            <AnimatedWord
              key={index}
              word={word}
              wordIndex={index}
              totalWords={totalWords}
              scrollYProgress={scrollYProgress}
              addLineBreak={word === "high"}
            />
          ))}
          <span className="text-landing-primary-400">&rdquo;</span>
        </p>
        <div className={cn("flex flex-col md:gap-3 items-center", "gap-2")}>
          <p className={quoteAttributionName}>Hashim Reman</p>
          <p className={quoteAttributionRole}>CTO, Remo</p>
        </div>
      </div>
    </div>
  );
};

export default Blurb;
