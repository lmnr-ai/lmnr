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

const GranularEvalsImage = ({ className }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["end end", "start start"],
  });

  // BarContainer: animate from left-0 to right-0
  const barLeft = useTransform(scrollYProgress, [0, 1], ["0%", "-200px"]);

  // TraceContainer: animate from top-[32px] to bottom
  const traceTop = useTransform(scrollYProgress, [0, 1], ["32px", "-200px"]);

  // Bar chart configuration
  const barBaseClassName = "w-[32px] bg-landing-primary-400/50 rounded-t-sm relative z-10";
  const barHeights = ["15%", "35%", "20%", "45%", "50%", "40%", "30%", "55%", "70%", "45%", "60%", "85%"];

  return (
    <div
      ref={containerRef}
      className={cn("flex items-start overflow-hidden rounded-sm relative gap-1 bg-landing-surface-800", className)}
    >
      {/* Left Half - BarContainer */}
      <div className="flex-1 relative h-full bg-landing-surface-700 overflow-hidden">
        {/* NumberContainer - Static in top left */}
        <div className="absolute top-3 left-4 flex flex-col gap-2 z-20">
          <div className="bg-landing-surface-600 border border-landing-surface-400 flex gap-1 items-center px-2 py-1 rounded w-fit">
            <p className="text-landing-text-300 text-xs">Reward</p>
            <ChevronDown className="w-4 h-4 text-landing-text-500" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-landing-text-500 text-xs">Average</p>
            <p className="text-landing-text-400 text-[42px] font-semibold leading-[36px]">0.72</p>
          </div>
        </div>

        {/* BarContainer - Animated bar chart */}
        <motion.div className="absolute flex items-end gap-[2px] px-2 pb-4 bottom-0 h-[60%]" style={{ left: barLeft }}>
          {/* Grid lines background */}
          <div className="absolute inset-0 flex flex-col justify-between py-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-[1px] w-full bg-landing-surface-400" />
            ))}
          </div>

          {/* Bar chart bars */}
          {barHeights.map((height, i) => (
            <div key={i} className={cn(barBaseClassName)} style={{ height }} />
          ))}
        </motion.div>
      </div>

      {/* Right Half - TraceContainer */}
      <div className="flex-1 relative overflow-hidden bg-landing-surface-700 rounded-sm h-full">
        <motion.div
          className="absolute bg-landing-surface-600 border border-landing-surface-400 flex flex-col items-start w-[460px] left-[40px]"
          style={{ top: traceTop }}
        >
          {/* Header */}
          <div className="border-b border-landing-surface-400 flex flex-col gap-3 px-4 py-3 w-full">
            <div className="flex items-center justify-between w-full">
              <div className="flex gap-4 items-center">
                <div className="flex gap-1 items-center">
                  <ChevronsRight className="w-5 h-5 text-landing-text-300" />
                  <Maximize className="w-3 h-3 text-landing-text-500" />
                </div>
                <p className="text-landing-text-300 text-base">Trace</p>
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
                <ChevronDown className="w-4 h-4 text-landing-text-300" />
                <ChevronDown className="w-4 h-4 text-landing-text-300 rotate-180" />
                <PlayCircle className="w-4 h-4 text-landing-text-300" />
                <Share2 className="w-4 h-4 text-landing-text-300" />
              </div>
            </div>
            <div className="flex gap-2 items-center w-full">
              <div className="bg-[rgba(208,117,78,0.1)] border border-[rgba(208,117,78,0.5)] flex gap-1 items-center px-2 py-1 rounded">
                <List className="w-2.5 h-2.5 text-landing-primary-400" />
                <p className="text-landing-primary-400 text-xs">Reader</p>
                <ChevronDown className="w-2.5 h-2.5 text-landing-primary-400" />
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

          {/* Trace Steps */}
          <div className="flex flex-col items-start w-full">
            {/* Step 1 - Navigated */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
                  <Bolt className="w-3 h-3 text-landing-text-300" />
                </div>
                <p className="text-landing-text-300 text-xs">navigated to https://laminar.sh</p>
              </div>
            </div>

            {/* Step 2 - LLM Call (Expanded) */}
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
                  <MessageCircle className="w-3 h-3 text-landing-text-300" />
                </div>
                <p className="text-landing-text-300 text-xs">gpt-05-nano-2025-08-07</p>
              </div>
            </div>
            <div className="flex items-start justify-between max-h-[117px] overflow-hidden pb-3 pl-[58px] pr-2 w-full">
              <p className="flex-1 text-landing-text-500 text-xs leading-normal">
                Current state shows we are on{" "}
                <a href="https://laminar.sh/" className="underline">
                  https://laminar.sh
                </a>{" "}
                with several top navigation links, including a visible Pricing link at index 4. The user asked to go to
                laminar.sh and describe their pricing plans. The immediate next actionable step is to navigate to the
                Pricing page to access the pricing information. I will click the Pricing link (index 4) to load the
                pricing page, after which I will extract and summarize the pricing plans on the page in the next step.
              </p>
            </div>

            {/* Step 3 - Click */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
                  <Bolt className="w-3 h-3 text-landing-text-300" />
                </div>
                <p className="text-landing-text-300 text-xs">click</p>
              </div>
            </div>

            {/* Step 4 - LLM Call (Expanded) */}
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
                  <MessageCircle className="w-3 h-3 text-landing-text-300" />
                </div>
                <p className="text-landing-text-300 text-xs">gpt-05-nano-2025-08-07</p>
              </div>
            </div>
            <div className="flex items-start justify-between max-h-[117px] overflow-hidden pb-3 pl-[58px] pr-2 w-full">
              <p className="flex-1 text-landing-text-500 text-xs leading-normal">
                Current task: on the Pricing page for laminar.sh and need to extract and describe pricing plans. The
                previous step shows the Pricing link was clicked and the page likely loaded. Based on browser_state,
                there are multiple pricing tiers listed: Free, Hobby, Pro, Enterprise, plus a Pricing calculator with
                Free tier and token-based pricing. I will perform a structured extraction of the pricing sections to
                summarize plan names, prices, included features, data retention, and team members. This will prepare a
                clear description for the user. No navigation changes needed; just extract the page content relevant to
                pricing for accurate description.
              </p>
            </div>

            {/* Step 5 - Extracted pricing */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
                  <Bolt className="w-3 h-3 text-landing-text-300" />
                </div>
                <p className="text-landing-text-300 text-xs">
                  extracted pricing plans and their details on Laminar Pr...
                </p>
              </div>
            </div>

            {/* Step 6 - LLM Response (Expanded with list) */}
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
                  <MessageCircle className="w-3 h-3 text-landing-text-300" />
                </div>
                <p className="text-landing-text-300 text-xs">gpt-05-nano-2025-08-07</p>
              </div>
            </div>
            <div className="flex items-start justify-between max-h-[117px] overflow-hidden pb-3 pl-[58px] pr-2 w-full">
              <ul className="flex-1 text-landing-text-500 text-xs leading-tight list-disc ml-4">
                <li>Free</li>
                <li>Price: $0 / month</li>
                <li>Data: 1 GB data / month</li>
                <li>Data retention: 15 days</li>
                <li>Team members: 1</li>
                <li>Support: Community support</li>
                <li>Hobby</li>
                <li>Price: $30 / month</li>
                <li>Data: 3 GB data / month included</li>
                <li>Additional data: $2 per 1 GB</li>
                <li>Data retention: 30 days</li>
                <li>Team members: Unlimited</li>
                <li>Support: Priority email support</li>
                <li>Pro</li>
                <li>Price: $150 / month</li>
              </ul>
            </div>

            {/* Step 7 - Final thinking step */}
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
                  <MessageCircle className="w-3 h-3 text-landing-text-300" />
                </div>
                <p className="text-landing-text-300 text-xs">gpt-05-nano-2025-08-07</p>
              </div>
            </div>
            <div className="flex items-start justify-between max-h-[117px] overflow-hidden pb-3 pl-[58px] pr-2 w-full">
              <p className="flex-1 text-landing-text-500 text-xs leading-normal">
                Reviewing the agent history shows step-by-step progress: the user asked to go to laminar.sh and describe
                pricing plans. We navigated to the pricing page and extracted structured details about Free, Hobby, Pro,
                Enterprise, and the pricing calculator. The read_state_0 provides a concise, structured summary
                including price, data, retention, team members, and support for each plan. Next, I will consolidate this
                into a readable summary file for easy reference and provide a concise description to the user. Since the
                instruction prefers stepwise actions, I'll save the structured summary to a file for traceability and
                then prepare the user-facing description in the next step.
              </p>
            </div>

            {/* Step 8 - Writing to file */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
                <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
                  <Bolt className="w-3 h-3 text-landing-text-300" />
                </div>
                <p className="text-landing-text-300 text-xs">writing to pricingsummary.md</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="w-full absolute bottom-0 left-0 h-[50%] bg-gradient-to-t from-landing-surface-700 to-landing-surface-700/0 z-10" />
    </div>
  );
};

export default GranularEvalsImage;
