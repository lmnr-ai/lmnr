"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { subSection } from "../../class-names";
import LightningFastIngestion from "./lightning-fast-ingestion";

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
      <LightningFastIngestion className="h-full w-[300px] shrink-0" />
    </div>
  </section>
);

export default BuiltForProduction;
