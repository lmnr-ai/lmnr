"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { subSection } from "../class-names";

// Inlined as JSX (not <img>) so `fill="currentColor"` lets the consumer
// drive both the fill and the stroke from any text-* class. External SVG
// loaded via <img> is sandboxed by the browser and can't be restyled.
const RustLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 144 144" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Rust">
    <path
      fill="currentColor"
      d="m71.05 23.68c-26.06 0-47.27 21.22-47.27 47.27s21.22 47.27 47.27 47.27 47.27-21.22 47.27-47.27-21.22-47.27-47.27-47.27zm-.07 4.2a3.1 3.11 0 0 1 3.02 3.11 3.11 3.11 0 0 1 -6.22 0 3.11 3.11 0 0 1 3.2-3.11zm7.12 5.12a38.27 38.27 0 0 1 26.2 18.66l-3.67 8.28c-.63 1.43.02 3.11 1.44 3.75l7.06 3.13a38.27 38.27 0 0 1 .08 6.64h-3.93c-.39 0-.55.26-.55.64v1.8c0 4.24-2.39 5.17-4.49 5.4-2 .23-4.21-.84-4.49-2.06-1.18-6.63-3.14-8.04-6.24-10.49 3.85-2.44 7.85-6.05 7.85-10.87 0-5.21-3.57-8.49-6-10.1-3.42-2.25-7.2-2.7-8.22-2.7h-40.6a38.27 38.27 0 0 1 21.41-12.08l4.79 5.02c1.08 1.13 2.87 1.18 4 .09zm-44.2 23.02a3.11 3.11 0 0 1 3.02 3.11 3.11 3.11 0 0 1 -6.22 0 3.11 3.11 0 0 1 3.2-3.11zm74.15.14a3.11 3.11 0 0 1 3.02 3.11 3.11 3.11 0 0 1 -6.22 0 3.11 3.11 0 0 1 3.2-3.11zm-68.29.5h5.42v24.44h-10.94a38.27 38.27 0 0 1 -1.24-14.61l6.7-2.98c1.43-.64 2.08-2.31 1.44-3.74zm22.62.26h12.91c.67 0 4.71.77 4.71 3.8 0 2.51-3.1 3.41-5.65 3.41h-11.98zm0 17.56h9.89c.9 0 4.83.26 6.08 5.28.39 1.54 1.26 6.56 1.85 8.17.59 1.8 2.98 5.4 5.53 5.4h16.14a38.27 38.27 0 0 1 -3.54 4.1l-6.57-1.41c-1.53-.33-3.04.65-3.37 2.18l-1.56 7.28a38.27 38.27 0 0 1 -31.91-.15l-1.56-7.28c-.33-1.53-1.83-2.51-3.36-2.18l-6.43 1.38a38.27 38.27 0 0 1 -3.32-3.92h31.27c.35 0 .59-.06.59-.39v-11.06c0-.32-.24-.39-.59-.39h-9.15zm-14.43 25.33a3.11 3.11 0 0 1 3.02 3.11 3.11 3.11 0 0 1 -6.22 0 3.11 3.11 0 0 1 3.2-3.11zm46.05.14a3.11 3.11 0 0 1 3.02 3.11 3.11 3.11 0 0 1 -6.22 0 3.11 3.11 0 0 1 3.2-3.11z"
    />
    <path
      fill="currentColor"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="3"
      fillRule="evenodd"
      d="m115.68 70.95a44.63 44.63 0 0 1 -44.63 44.63 44.63 44.63 0 0 1 -44.63-44.63 44.63 44.63 0 0 1 44.63-44.63 44.63 44.63 0 0 1 44.63 44.63zm-.84-4.31 6.96 4.31-6.96 4.31 5.98 5.59-7.66 2.87 4.78 6.65-8.09 1.32 3.4 7.46-8.19-.29 1.88 7.98-7.98-1.88.29 8.19-7.46-3.4-1.32 8.09-6.65-4.78-2.87 7.66-5.59-5.98-4.31 6.96-4.31-6.96-5.59 5.98-2.87-7.66-6.65 4.78-1.32-8.09-7.46 3.4.29-8.19-7.98 1.88 1.88-7.98-8.19.29 3.4-7.46-8.09-1.32 4.78-6.65-7.66-2.87 5.98-5.59-6.96-4.31 6.96-4.31-5.98-5.59 7.66-2.87-4.78-6.65 8.09-1.32-3.4-7.46 8.19.29-1.88-7.98 7.98 1.88-.29-8.19 7.46 3.4 1.32-8.09 6.65 4.78 2.87-7.66 5.59 5.98 4.31-6.96 4.31 6.96 5.59-5.98 2.87 7.66 6.65-4.78 1.32 8.09 7.46-3.4-.29 8.19 7.98-1.88-1.88 7.98 8.19-.29-3.4 7.46 8.09 1.32-4.78 6.65 7.66 2.87z"
    />
  </svg>
);

// FLAG: "Read more" needs a real destination — once we publish a compression
// deep-dive, swap `/blog` for that post.
const READ_MORE_HREF = "https://laminar.sh/blog";

interface Feature {
  label: string;
}

const FEATURES: Feature[] = [
  { label: "Blazing fast, written in Rust" },
  { label: "Terabytes of production data with ease" },
  { label: "Full-text search on all data" },
];

const CompressionHero = () => (
  <div className="flex flex-col gap-3 items-start shrink-0">
    <p className="font-manrope font-medium text-landing-text-100 text-[60px] leading-[60px] tracking-[-0.02em]">20x</p>
    <p className="text-base leading-5 text-landing-text-200 w-[244px]">
      trace compression ratio means faster reads, faster writes, and lower storage costs
    </p>
    <Link
      href={READ_MORE_HREF}
      target="_blank"
      className="inline-flex items-center gap-1 text-xs text-landing-text-300 hover:text-landing-text-100 transition-colors"
    >
      Read more
      <ArrowRight className="size-3" strokeWidth={2} />
    </Link>
  </div>
);

const CompressionChart = () => (
  <div className="flex flex-col gap-1 items-start pt-5 w-full md:flex-1 md:min-w-0">
    <motion.div
      className="bg-landing-surface-500 flex h-11 items-center justify-end px-3 overflow-hidden whitespace-nowrap w-full"
      initial={{ width: 0 }}
      whileInView={{ width: "100%" }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 0.9, ease: "easeOut" }}
    >
      <p className="text-sm text-landing-text-300">Competition</p>
    </motion.div>
    <div className="flex items-center gap-3 h-11 w-full">
      <motion.div
        className="bg-landing-primary-400 h-full"
        initial={{ width: 0 }}
        whileInView={{ width: "5%" }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: 1 }}
      />
      <p className="text-sm text-landing-text-100">Laminar</p>
    </div>
  </div>
);

const FeatureRow = ({ label }: Feature) => (
  <div className="flex items-center h-14 w-full border-t border-landing-text-600">
    <p className="text-lg leading-6 text-landing-text-300">{label}</p>
  </div>
);

const BuiltForProduction = () => (
  <section className="flex flex-col items-start gap-[52px] w-full">
    <h2 className={cn(subSection)}>Production-grade performance</h2>

    <div className="flex flex-col gap-10 md:flex-row md:gap-[52px] md:items-start w-full">
      <CompressionHero />
      <CompressionChart />
    </div>

    <div className="flex w-full gap-13">
      <div className="flex flex-col w-full md:flex-1">
        {FEATURES.map((f) => (
          <FeatureRow key={f.label} {...f} />
        ))}
      </div>
      <div className="bg-landing-surface-550 h-full w-[240px] relative overflow-hidden">
        <RustLogo className="size-[280px] text-landing-surface-700 absolute -bottom-22 -right-18" />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-landing-surface-550/60 to-transparent h-[40px]" />
      </div>
    </div>
  </section>
);

export default BuiltForProduction;
