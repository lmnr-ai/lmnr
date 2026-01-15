"use client";

import { cn } from "@/lib/utils";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import Image from "next/image";
import architecture from "@/assets/landing/architecture.svg";

interface Props {
  className?: string;
}

const SystemDiagram = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start start"],
  });

  // All paths animate together using the same scroll progress
  const pathProgress = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.8, 1]);

  return (
    <div className={cn("relative overflow-hidden", className)} ref={ref}>
      {/* Background image */}
      <Image src={architecture} alt="System Architecture Diagram" className="w-full" />

      {/* SVG overlay centered on top */}
      <svg
        className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-auto"
        viewBox="0 0 674 636"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g clipPath="url(#clip0_3117_593)">
          <motion.path
            d="M0.5 263H219.266C227.443 263 235.311 266.131 241.252 271.75L406.748 428.25C412.69 433.869 420.557 437 428.735 437H579C585.628 437 591 442.373 591 449V478.5C591 485.127 596.373 490.5 603 490.5H674.5"
            stroke="#6A3E2B"
            strokeWidth="2"
            fill="none"
            pathLength={pathProgress}
          />
          <motion.path
            d="M0.5 263H219.266C227.443 263 235.311 266.131 241.252 271.75L406.748 428.25C412.69 433.869 420.557 437 428.735 437H579C585.628 437 591 431.627 591 425V343.5C591 336.873 596.373 331.5 603 331.5H674.5"
            stroke="#6A3E2B"
            strokeWidth="2"
            fill="none"
            pathLength={pathProgress}
          />
          <motion.path
            d="M0.5 263H219.266C227.443 263 235.311 266.131 241.252 271.75L406.748 428.25C412.69 433.869 420.557 437 428.735 437H579C585.628 437 591 431.627 591 425V185C591 178.373 596.373 173 603 173H674.5"
            stroke="#6A3E2B"
            strokeWidth="2"
            fill="none"
            pathLength={pathProgress}
          />
          <motion.path
            d="M0.5 263H219.266C227.443 263 235.311 266.131 241.252 271.75L282.748 310.989C288.689 316.608 296.557 319.739 304.734 319.739H555.5C562.127 319.739 567.5 314.366 567.5 307.739V27.5C567.5 20.8726 572.873 15.5 579.5 15.5H674"
            stroke="#6A3E2B"
            strokeWidth="2"
            fill="none"
            pathLength={pathProgress}
          />
        </g>
        <defs>
          <clipPath id="clip0_3117_593">
            <rect width="674" height="636" fill="white" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
};

export default SystemDiagram;
