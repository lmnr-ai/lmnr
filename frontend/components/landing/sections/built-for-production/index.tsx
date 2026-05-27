"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { subSection } from "../../class-names";

// FLAG: "Read more" needs a real destination — once we publish a compression
// deep-dive, swap `/blog` for that post.
const READ_MORE_HREF = "https://laminar.sh/blog";

interface Feature {
  label: string;
}

const FEATURES: Feature[] = [
  { label: "Blazing fast, written in Rust" },
  { label: "Ingest terabytes of production data" },
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

// 3 stacked rows, each 56px tall with a top border. Used in the left/right
// columns. The bolt column does NOT use these — instead it draws its OWN Z
// horizontals slightly offset from y=0/56/112 so the dividers don't visually
// connect into the bolt's knees (the gap is the deliberate effect).
const DividerRow = () => <div className="h-14 w-full border-t border-landing-text-600" />;

// Top-LEFT row only — per figma (node 4238:7393) this row's top divider is
// landing-primary-400 instead of text-600. Rendered as a 1px gradient bar
// (orange → transparent) rather than a solid border so it fades into the
// rest of the row at y=0.
const OrangeBorderRow = () => (
  <div className="relative h-14 w-full">
    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-landing-primary-400 to-landing-text-600" />
  </div>
);

// Bolt column — 129px wide, 168px tall. Renders the Z exported from figma:
// a top horizontal that only covers the LEFT portion, a diagonal down to
// the middle, a middle horizontal covering the RIGHT portion of y=56, then
// a separate bottom horizontal at y=112.5. All strokes solid #434447, no
// gradient in the bolt itself.
const BoltColumn = () => (
  <div className="relative w-[129px] h-[168px] shrink-0">
    <svg
      className="absolute inset-0 size-full text-landing-text-600 pointer-events-none"
      viewBox="0 0 129 168"
      fill="none"
      aria-hidden="true"
    >
      {/* The Z — single path so the joins between the horizontals and the
          diagonal stay clean. (0,0.5) → (89,0.5) → (40,56.5) → (129,56.5) */}
      <path d="M0 0.5 H89 L40 56.5 H129" stroke="currentColor" strokeWidth="1" />

      {/* Bottom horizontal stroke at y=112.5 — matches Path 2 of the figma
          export. Visually merges with the side-column divider at y=112. */}
      <path d="M0 112.5 H128.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  </div>
);

const FeatureRow = ({ label }: Feature) => (
  <div className="flex items-center justify-end h-14 w-full border-t border-landing-text-600">
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

    <div className="flex w-full">
      {/* Left placeholder — 3 divider rows, no content. The TOP row's
          divider is the orange-fade variant; the rest are gray. */}
      <div className="flex flex-col w-[320px] shrink-0">
        <OrangeBorderRow />
        <DividerRow />
        <DividerRow />
      </div>

      <BoltColumn />

      {/* Right features column — right-aligned text on each row. */}
      <div className="flex flex-col flex-1 min-w-0">
        {FEATURES.map((f) => (
          <FeatureRow key={f.label} {...f} />
        ))}
      </div>
    </div>
  </section>
);

export default BuiltForProduction;
