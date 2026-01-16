"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import {
  Bolt,
  ChevronDown,
  ChevronRight,
  ChevronsRight,
  Clock,
  DollarSign,
  FileText,
  Filter,
  List,
  Maximize,
  MessageCircle,
  PlayCircle,
  Search,
  Share2,
  Sparkles,
} from "lucide-react";
import { useRef } from "react";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const RolloutImage = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const traceY = useTransform(scrollYProgress, [0, 0.2, 1], [0, -40, -700]);

  return (
    <div className={cn("bg-landing-surface-700 overflow-hidden relative rounded-sm", className)} ref={ref}>
      <motion.div className="flex flex-row w-full pl-[200px] pt-[60px]" style={{ y: traceY }}>
        <div className="w-[600px] flex flex-col shadow-[0px_8px_120px_0px_var(--color-landing-surface-800)] z-30">
          {/* Trace Header */}
          <div className="border-b border-landing-surface-400 bg-landing-surface-600 flex flex-col gap-3 px-4 py-3 w-full rounded-t-lg border-t border-x">
            <div className="flex items-center justify-between w-full">
              <div className="flex gap-4 items-center">
                <div className="flex gap-1 items-center">
                  <ChevronsRight className="w-5 h-5 text-landing-text-500" />
                  <Maximize className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-500 text-base">Trace</p>
                <div className="bg-landing-surface-600 border-[0.5px] border-landing-surface-400 flex gap-2 items-center px-2 py-0.5 rounded">
                  <div className="flex gap-1 items-center">
                    <Clock className="w-2.5 h-2.5 text-landing-text-500" />
                    <p className="text-landing-text-500 text-xs">123.36s</p>
                  </div>
                  <div className="flex gap-1 items-center">
                    <DollarSign className="w-3 h-3 text-landing-text-500" />
                    <p className="text-landing-text-500 text-xs">81k</p>
                  </div>
                  <div className="flex gap-1 items-center">
                    <DollarSign className="w-3 h-3 text-landing-text-500" />
                    <p className="text-landing-text-500 text-xs">0.005</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <ChevronDown className="w-4 h-4 text-landing-text-500" />
                <ChevronDown className="w-4 h-4 text-landing-text-500 rotate-180" />
                <PlayCircle className="w-4 h-4 text-landing-text-500" />
                <Share2 className="w-4 h-4 text-landing-text-500" />
              </div>
            </div>
            <div className="flex gap-2 items-center w-full">
              <div className="bg-landing-surface-600 border border-landing-surface-400 flex gap-1 items-center px-2 py-1 rounded">
                <List className="w-2.5 h-2.5 text-landing-text-500" />
                <p className="text-landing-text-500 text-xs">Reader</p>
                <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
              </div>
              <div className="bg-landing-surface-600 border border-landing-surface-400 flex gap-1 items-center px-2 py-1 rounded">
                <Filter className="w-2.5 h-2.5 text-landing-text-500" />
                <p className="text-landing-text-500 text-xs">Filters</p>
              </div>
              <div className="bg-landing-surface-600 border border-landing-surface-400 flex gap-1 items-center px-2 py-1 rounded">
                <Search className="w-2.5 h-2.5 text-landing-text-500" />
                <p className="text-landing-text-500 text-xs">Search</p>
              </div>
              <div className="bg-landing-surface-600 border border-landing-surface-400 flex gap-1 items-center px-2 py-1 rounded">
                <FileText className="w-2.5 h-2.5 text-landing-text-500" />
                <p className="text-landing-text-500 text-xs">Metadata</p>
              </div>
              <div className="bg-landing-surface-600 border border-landing-surface-400 flex gap-1 items-center px-2 py-1 rounded">
                <Sparkles className="w-2.5 h-2.5 text-landing-text-500" />
                <p className="text-landing-text-500 text-xs">Ask AI</p>
              </div>
            </div>
          </div>

          {/* Cached section - normal rows */}
          {/* navigated */}
          <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full bg-landing-surface-600 border-x">
            <div className="flex gap-2 items-center">
              <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
              <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
                <Bolt className="w-3 h-3 text-landing-text-500" />
              </div>
              <p className="text-landing-text-500 text-xs">navigated to https://laminar.sh</p>
            </div>
          </div>

          {/* LLM output */}
          <div className="flex h-7 items-center px-3 w-full bg-landing-surface-600 border-x border-landing-surface-400">
            <div className="flex gap-2 items-center">
              <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
              <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
                <MessageCircle className="w-3 h-3 text-landing-text-500" />
              </div>
              <p className="text-landing-text-500 text-xs">gpt-05-nano-2025-08-07</p>
              <div className="bg-landing-surface-500 border-[0.5px] border-landing-surface-600 flex items-center px-2 py-0.5 rounded">
                <p className="text-landing-text-500 text-xs">Cached</p>
              </div>
            </div>
          </div>
          <div className="flex items-start pb-2 pl-[58px] pr-2 w-full bg-landing-surface-600 border-x border-landing-surface-400">
            <p className="text-landing-text-500 text-xs">Current state shows navigation links including Pricing.</p>
          </div>

          {/* click row */}
          <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full bg-landing-surface-600 border-x">
            <div className="flex gap-2 items-center">
              <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
              <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
                <Bolt className="w-3 h-3 text-landing-text-500" />
              </div>
              <p className="text-landing-text-500 text-xs">click</p>
            </div>
          </div>

          {/* LLM */}
          <div className="flex h-7 items-center px-3 w-full bg-landing-surface-600 border-x border-landing-surface-400">
            <div className="flex gap-2 items-center">
              <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
              <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
                <MessageCircle className="w-3 h-3 text-landing-text-500" />
              </div>
              <p className="text-landing-text-500 text-xs">gpt-05-nano-2025-08-07</p>
              <div className="bg-landing-surface-500 border-[0.5px] border-landing-surface-600 flex items-center px-2 py-0.5 rounded">
                <p className="text-landing-text-500 text-xs">Cached</p>
              </div>
            </div>
          </div>
          <div className="flex items-start pb-2 pl-[58px] pr-2 w-full bg-landing-surface-600 border-x border-landing-surface-400">
            <p className="text-landing-text-500 text-xs">
              Current state shows we are on <span className="underline">https://laminar.sh</span>
            </p>
          </div>

          {/* screenshot row */}
          <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full bg-landing-surface-600 border-x">
            <div className="flex gap-2 items-center">
              <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
              <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
                <Bolt className="w-3 h-3 text-landing-text-500" />
              </div>
              <p className="text-landing-text-500 text-xs">screenshot</p>
            </div>
          </div>

          {/* LLM */}
          <div className="flex h-7 items-center px-3 w-full bg-landing-surface-600 border-x border-landing-surface-400">
            <div className="flex gap-2 items-center">
              <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
              <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
                <MessageCircle className="w-3 h-3 text-landing-text-500" />
              </div>
              <p className="text-landing-text-500 text-xs">gpt-05-nano-2025-08-07</p>
              <div className="bg-landing-primary-400/10 border-[0.5px] border-landing-primary-400/50 flex items-center px-2 py-0.5 rounded">
                <p className="text-landing-primary-400/80 text-xs">Cache until here</p>
              </div>
            </div>
          </div>
          <div className="flex items-start pb-2 pl-[58px] pr-2 w-full bg-landing-surface-600 border-x border-landing-surface-400">
            <p className="text-landing-text-500 text-xs">Extracting pricing information from the page...</p>
          </div>

          {/* click row */}
          <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full bg-landing-surface-600 border-x">
            <div className="flex gap-2 items-center">
              <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
              <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
                <Bolt className="w-3 h-3 text-landing-text-500" />
              </div>
              <p className="text-landing-text-500 text-xs">click</p>
            </div>
          </div>

          {/* Rerun section - orange background with left panel */}
          <div className="w-full flex flex-col relative bg-gradient-to-b from-landing-surface-500 to-landing-surface-600 border-x border-landing-surface-400">
            {/* Left panel with Cache until here / Rerun */}
            <div className="absolute w-[200px] left-[-200px] top-0 h-full bg-landing-primary-400/5 border-t border-landing-primary-400/20 px-5">
              <div className="flex flex-col relative pt-2">
                <div className="flex items-center gap-1">
                  <PlayCircle className="w-4 h-4 text-landing-primary-400/70" />
                  <p className="text-landing-primary-400 text-base">Rerun</p>
                </div>
              </div>
            </div>

            {/* LLM - no Cached badge in rerun section */}
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
                  <MessageCircle className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-500 text-xs">gpt-05-nano-2025-08-07</p>
              </div>
            </div>
            <div className="flex items-start pb-2 pl-[58px] pr-2 w-full">
              <p className="text-landing-text-500 text-xs">
                Current task: on the Pricing page for laminar.sh and need to extract and describe pricing plans.
              </p>
            </div>

            {/* extracted pricing plans */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
                  <Bolt className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-500 text-xs">
                  extracted pricing plans and their details on Laminar Pr...
                </p>
              </div>
            </div>

            {/* LLM with pricing */}
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
                  <MessageCircle className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-500 text-xs">gpt-05-nano-2025-08-07</p>
              </div>
            </div>
            <div className="flex items-start pb-2 pl-[58px] pr-2 w-full">
              <ul className="text-landing-text-500 text-xs list-disc list-inside">
                <li>Free</li>
                <li>Price: $0 / month</li>
                <li>Data: 1 GB data / month</li>
                <li>Data retention: 15 days</li>
              </ul>
            </div>

            {/* LLM reviewing */}
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
                  <MessageCircle className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-500 text-xs">gpt-05-nano-2025-08-07</p>
              </div>
            </div>
            <div className="flex items-start pb-2 pl-[58px] pr-2 w-full">
              <p className="text-landing-text-500 text-xs">
                Reviewing the agent history shows step-by-step progress: the user asked to go to laminar.sh and describe
                pricing plans.
              </p>
            </div>

            {/* writing */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
                  <Bolt className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-500 text-xs">writing to pricing_summary.md</p>
              </div>
            </div>

            {/* More LLM */}
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
                  <MessageCircle className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-500 text-xs">gpt-05-nano-2025-08-07</p>
              </div>
            </div>
            <div className="flex items-start pb-2 pl-[58px] pr-2 w-full">
              <p className="text-landing-text-500 text-xs">
                Reviewing the agent history shows step-by-step progress: the user asked to go to laminar.sh and describe
                pricing plans.
              </p>
            </div>

            {/* writing */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
                  <Bolt className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-500 text-xs">writing to pricing_summary.md</p>
              </div>
            </div>

            {/* More LLM */}
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
                  <MessageCircle className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-500 text-xs">gpt-05-nano-2025-08-07</p>
              </div>
            </div>
            <div className="flex items-start pb-2 pl-[58px] pr-2 w-full">
              <p className="text-landing-text-500 text-xs">
                Reviewing the agent history shows step-by-step progress: the user asked to go to laminar.sh and describe
                pricing plans.
              </p>
            </div>

            {/* writing */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
                  <Bolt className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-500 text-xs">writing to pricing_summary.md</p>
              </div>
            </div>

            {/* More LLM */}
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
                  <MessageCircle className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-500 text-xs">gpt-05-nano-2025-08-07</p>
              </div>
            </div>
            <div className="flex items-start pb-2 pl-[58px] pr-2 w-full">
              <p className="text-landing-text-500 text-xs">
                Reviewing the agent history shows step-by-step progress: the user asked to go to laminar.sh and describe
                pricing plans.
              </p>
            </div>

            {/* writing */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
                  <Bolt className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-500 text-xs">writing to pricing_summary.md</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Bottom gradient overlay */}
      <div className="absolute bottom-0 left-0 w-full h-[283px] bg-gradient-to-t from-landing-surface-700 to-transparent z-20 pointer-events-none" />
    </div>
  );
};

export default RolloutImage;
