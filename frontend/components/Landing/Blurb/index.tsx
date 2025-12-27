"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, MotionValue } from "framer-motion";
import { cn } from "@/lib/utils";
import { quoteText, quoteSize, quoteAttributionName, quoteAttributionRole } from "../classNames";

interface Props {
  className?: string;
}

interface AnimatedWordProps {
  word: string;
  wordIndex: number;
  totalWords: number;
  scrollYProgress: MotionValue<number>;
}

const AnimatedWord = ({ word, wordIndex, totalWords, scrollYProgress }: AnimatedWordProps) => {
  const wordProgress = useTransform(scrollYProgress, (v) => 1.2 * v - wordIndex / totalWords - 0.1);

  const color = useTransform(wordProgress, (progress) => {
    if (progress < 0) return "var(--color-landing-text-200)"; // text-landing-text-200
    return "rgb(255 255 255)"; // text-landing-text-100
  });

  return <motion.span style={{ color }}>{word} </motion.span>;
};

const Blurb = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start start"],
  });

  // Split text into words
  const text1 = " Laminar's evals help us maintain high ";
  const text2 = "accuracy while moving fast. We now use them for every LLM based feature we build. ";
  const words1 = text1.split(" ");
  const words2 = text2.split(" ");
  const totalWords = words1.length + words2.length;

  return (
    <div className={cn("bg-landing-surface-900 flex flex-col items-center px-10 py-40", className)}>
      <div className="flex flex-col gap-[50px] items-center" ref={ref}>
        <div className={cn(quoteText, "max-w-[840px]")}>
          <p className={cn(quoteSize, "mb-0")}>
            <span className="text-landing-primary-400">&ldquo;</span>
            {words1.map((word, index) => (
              <AnimatedWord
                key={index}
                word={word}
                wordIndex={index}
                totalWords={totalWords}
                scrollYProgress={scrollYProgress}
              />
            ))}
          </p>
          <p className={quoteSize}>
            {words2.map((word, index) => {
              const wordIndex = words1.length + index;
              return (
                <AnimatedWord
                  key={wordIndex}
                  word={word}
                  wordIndex={wordIndex}
                  totalWords={totalWords}
                  scrollYProgress={scrollYProgress}
                />
              );
            })}
            <span className="text-landing-primary-400">&rdquo;</span>
          </p>
        </div>
        <div className="flex flex-col gap-3 items-center">
          <p className={quoteAttributionName}>Hashim Reman</p>
          <p className={quoteAttributionRole}>CTO, REMO</p>
        </div>
      </div>
    </div>
  );
};

export default Blurb;
