"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { Bolt, ChevronDown, ChevronRight, MessageCircle } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const FullContextImage = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  useLayoutEffect(() => {
    const updateHeight = () => {
      if (ref.current) {
        setContainerHeight(ref.current.getBoundingClientRect().height);
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center start"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.8, 1]);
  const translateY = useTransform(scrollYProgress, [0, 1], [containerHeight % -1, containerHeight * -1.4]);

  return (
    <motion.div
      className={cn("size-full bg-landing-surface-700 overflow-hidden relative rounded-sm", className)}
      style={{ opacity }}
      ref={ref}
    >
      <motion.div
        className="absolute inset-0 flex items-start w-[80%] left-1/2 -translate-x-1/2"
        style={{ y: translateY }}
        ref={contentRef}
      >
        <div className="bg-landing-surface-600 flex items-start w-full">
          {/* Main content area */}
          <div className="flex flex-col items-start grow min-w-0 h-full">
            {/* Message row 1 - Navigation */}
            <div
              className={cn("border-b border-landing-surface-400 flex items-center w-full md:h-7 md:px-3", "h-6 px-2")}
            >
              <div className={cn("flex items-center md:gap-2", "gap-1.5")}>
                <ChevronRight size={10} className="shrink-0 text-landing-text-500" />
                <div className="bg-landing-primary-400/30 flex items-center p-1 rounded shrink-0">
                  <Bolt size={12} className="text-landing-text-300" />
                </div>
                <p className={cn("font-sans text-landing-text-300 md:text-xs", "text-[10px]")}>
                  navigated to https://laminar.sh
                </p>
              </div>
            </div>

            {/* Message row 2 - LLM response */}
            <div className={cn("flex items-center w-full md:h-7 md:px-3", "h-6 px-2")}>
              <div className={cn("flex items-center md:gap-2", "gap-1.5")}>
                <ChevronDown size={10} className="shrink-0 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded shrink-0">
                  <MessageCircle size={12} className="text-landing-text-300" />
                </div>
                <p className={cn("font-sans text-landing-text-300 md:text-xs", "text-[10px]")}>
                  gpt-05-nano-2025-08-07
                </p>
              </div>
            </div>

            {/* Expanded content */}
            <div
              className={cn(
                "flex items-start justify-between w-full md:pb-3 md:pl-[58px] md:pr-2",
                "pb-2 pl-[46px] pr-1.5"
              )}
            >
              <p className={cn("font-sans text-landing-text-500 leading-normal md:text-xs", "text-[10px]")}>
                Plan: From the Laminar homepage, click the Pricing link to load the pricing page. The on the pricing
                page, I will extract and describe the pricing plans.
              </p>
            </div>

            {/* Message row 3 - Click action */}
            <div
              className={cn("border-b border-landing-surface-400 flex items-center w-full md:h-7 md:px-3", "h-6 px-2")}
            >
              <div className={cn("flex items-center md:gap-2", "gap-1.5")}>
                <ChevronRight size={10} className="shrink-0 text-landing-text-500" />
                <div className="bg-landing-primary-400/30 flex items-center p-1 rounded shrink-0">
                  <Bolt size={12} className="text-landing-text-300" />
                </div>
                <p className={cn("font-sans text-landing-text-300 md:text-xs", "text-[10px]")}>click</p>
              </div>
            </div>

            {/* Message row 5 - Extract action */}
            <div
              className={cn("border-b border-landing-surface-400 flex items-center w-full md:h-7 md:px-3", "h-6 px-2")}
            >
              <div className={cn("flex items-center md:gap-2", "gap-1.5")}>
                <ChevronRight size={10} className="shrink-0 text-landing-text-500" />
                <div className="bg-landing-primary-400/30 flex items-center p-1 rounded shrink-0">
                  <Bolt size={12} className="text-landing-text-300" />
                </div>
                <p className={cn("font-sans text-landing-text-300 md:text-xs", "text-[10px]")}>
                  extracted pricing plans
                </p>
              </div>
            </div>

            {/* Message row 6 - LLM response */}
            <div className={cn("flex items-center w-full md:h-7 md:px-3", "h-6 px-2")}>
              <div className={cn("flex items-center md:gap-2", "gap-1.5")}>
                <ChevronDown size={10} className="shrink-0 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded shrink-0">
                  <MessageCircle size={12} className="text-landing-text-300" />
                </div>
                <p className={cn("font-sans text-landing-text-300 md:text-xs", "text-[10px]")}>
                  gpt-05-nano-2025-08-07
                </p>
              </div>
            </div>

            {/* Pricing data */}
            <div
              className={cn(
                "flex items-start justify-between w-full md:pb-3 md:pl-[58px] md:pr-2",
                "pb-2 pl-[46px] pr-1.5"
              )}
            >
              <div className={cn("font-sans text-landing-text-500 leading-normal md:text-xs", "text-[10px]")}>
                <p className="mb-0">Free</p>
                <ul className="list-disc mb-0 ml-[18px]">
                  <li className="mb-0">Price: $0 / month</li>
                  <li className="mb-0">Data: 1 GB data / month</li>
                  <li className="mb-0">Data retention: 15 days</li>
                  <li className="mb-0">Team members: 1</li>
                  <li>Support: Community support</li>
                </ul>
                <p className="mb-0">Hobby</p>
                <ul className="list-disc ml-[18px]">
                  <li className="mb-0">Price: $25 / month</li>
                  <li className="mb-0">Data: 2 GB data / month included</li>
                  <li className="mb-0">Additional data: $2 per 1 GB</li>
                  <li className="mb-0">Data retention: 30 days</li>
                  <li className="mb-0">Team members: 2</li>
                  <li>Support: Priority email support</li>
                </ul>
              </div>
            </div>

            {/* Message row 4 - LLM response (highlighted) */}
            <div className="bg-landing-primary-400/10 border-l border-landing-primary-400 flex flex-col items-start w-full">
              <div className={cn("flex items-center w-full md:h-7 md:px-3", "h-6 px-2")}>
                <div className={cn("flex items-center md:gap-2", "gap-1.5")}>
                  <ChevronDown size={10} className="shrink-0 text-landing-text-500" />
                  <div className="bg-[rgba(116,63,227,0.5)] flex items-center p-1 rounded shrink-0">
                    <MessageCircle size={12} className="text-landing-text-300" />
                  </div>
                  <p className={cn("font-sans text-landing-primary-400 md:text-xs", "text-[10px]")}>
                    gpt-05-nano-2025-08-07
                  </p>
                </div>
              </div>
              <div
                className={cn(
                  "flex items-start justify-between w-full md:pb-3 md:pl-[58px] md:pr-2",
                  "pb-2 pl-[46px] pr-1.5"
                )}
              >
                <p className={cn("font-sans text-landing-primary-400 leading-normal md:text-xs", "text-[10px]")}>
                  From the prior steps, we navigated to the Laminar pricing page and are now positioned to extract
                  pricing data. The user request to describe their pricing plans, so the immediate next action should be
                  to extract structured pricing.
                </p>
              </div>
            </div>

            {/* Message row 5 - Extract action */}
            <div
              className={cn("border-b border-landing-surface-400 flex items-center w-full md:h-7 md:px-3", "h-6 px-2")}
            >
              <div className={cn("flex items-center md:gap-2", "gap-1.5")}>
                <ChevronRight size={10} className="shrink-0 text-landing-text-500" />
                <div className="bg-landing-primary-400/30 flex items-center p-1 rounded shrink-0">
                  <Bolt size={12} className="text-landing-text-300 " />
                </div>
                <p className={cn("font-sans text-landing-text-300 md:text-xs", "text-[10px]")}>
                  Extracted pricing plans
                </p>
              </div>
            </div>

            {/* Message row 6 - LLM response */}
            <div className={cn("flex items-center w-full md:h-7 md:px-3", "h-6 px-2")}>
              <div className={cn("flex items-center md:gap-2", "gap-1.5")}>
                <ChevronDown size={10} className="shrink-0 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded shrink-0">
                  <MessageCircle size={12} className="text-landing-text-300 " />
                </div>
                <p className={cn("font-sans text-landing-text-300 md:text-xs", "text-[10px]")}>
                  gpt-05-nano-2025-08-07
                </p>
              </div>
            </div>

            {/* Pricing data */}
            <div
              className={cn(
                "flex items-start justify-between w-full md:pb-3 md:pl-[58px] md:pr-2",
                "pb-2 pl-[46px] pr-1.5"
              )}
            >
              <div className={cn("font-sans text-landing-text-500 leading-normal md:text-xs", "text-[10px]")}>
                <p className="mb-0">Free</p>
                <ul className="list-disc mb-0 ml-[18px]">
                  <li className="mb-0">Price: $0 / month</li>
                  <li className="mb-0">Data: 1 GB data / month</li>
                  <li className="mb-0">Data retention: 15 days</li>
                  <li className="mb-0">Team members: 1</li>
                  <li>Support: Community support</li>
                </ul>
                <p className="mb-0">Hobby</p>
                <ul className="list-disc ml-[18px]">
                  <li className="mb-0">Price: $25 / month</li>
                  <li className="mb-0">Data: 2 GB data / month included</li>
                  <li className="mb-0">Additional data: $2 per 1 GB</li>
                  <li className="mb-0">Data retention: 30 days</li>
                  <li className="mb-0">Team members: 2</li>
                  <li>Support: Priority email support</li>
                </ul>
              </div>
            </div>

            {/* More messages */}
            <div className={cn("flex items-center w-full md:h-7 md:px-3", "h-6 px-2")}>
              <div className={cn("flex items-center md:gap-2", "gap-1.5")}>
                <ChevronDown size={10} className="shrink-0 text-landing-text-500" />
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded shrink-0">
                  <MessageCircle size={12} className="text-landing-text-300 " />
                </div>
                <p className={cn("font-sans text-landing-text-300 md:text-xs", "text-[10px]")}>
                  gpt-05-nano-2025-08-07
                </p>
              </div>
            </div>

            <div
              className={cn(
                "flex items-start justify-between w-full md:pb-3 md:pl-[58px] md:pr-2",
                "pb-2 pl-[46px] pr-1.5"
              )}
            >
              <p className={cn("font-sans text-landing-text-500 leading-normal md:text-xs", "text-[10px]")}>
                We are on the Laminar pricing page nad have already retrieved detailed pricing data from the pagestate
                and read_state. The user asked to describe the pricing plans.
              </p>
            </div>

            {/* Writing action */}
            <div
              className={cn("border-b border-landing-surface-400 flex items-center w-full md:h-7 md:px-3", "h-6 px-2")}
            >
              <div className={cn("flex items-center md:gap-2", "gap-1.5")}>
                <ChevronRight size={10} className="shrink-0 text-landing-text-500" />
                <div className="bg-landing-primary-400/30 flex items-center p-1 rounded shrink-0">
                  <Bolt size={12} className="text-landing-text-300 " />
                </div>
                <p className={cn("font-sans text-landing-text-300 md:text-xs", "text-[10px]")}>
                  writing to pricing_summary.md
                </p>
              </div>
            </div>
          </div>

          {/* Timeline sidebar */}
          <div className="flex gap-1 items-center p-1 self-stretch shrink-0">
            {/* Colored timeline bars */}
            <div className="border-l border-landing-surface-400 flex flex-col gap-px h-full shrink-0">
              <div className="h-[3px] w-1 bg-landing-primary-400/30" />
              <div className="h-[119px] w-1 bg-[rgba(116,63,227,0.3)]" />
              <div className="h-[3px] w-1 bg-landing-primary-400/30" />
              <div className="h-[119px] w-1 bg-[rgba(116,63,227,0.3)]" />
              <div className="h-[3px] w-1 bg-landing-primary-400/30" />
              <div className="h-[119px] w-1 bg-[rgba(116,63,227,0.3)]" />
              <div className="h-[3px] w-1 bg-landing-primary-400/30" />
              <div className="h-[119px] w-1 bg-[rgba(116,63,227,0.3)]" />
              <div className="h-[3px] w-1 bg-landing-primary-400/30" />
            </div>

            {/* Time labels */}
            <div className="flex flex-col font-mono text-[10px] text-landing-text-600 text-right gap-7 h-full shrink-0 leading-normal">
              <p>0s</p>
              <p>10s</p>
              <p>20s</p>
              <p>30s</p>
              <p>40s</p>
              <p>50s</p>
              <p>60s</p>
              <p>70s</p>
              <p>80s</p>
              <p>90s</p>
              <p>100s</p>
              <p>110s</p>
              <p>120s</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Gradient overlay at bottom */}
      <div className="absolute bottom-0 left-0 flex h-[60%] items-center justify-center w-full bg-gradient-to-t from-landing-surface-700 to-landing-surface-700/0 pointer-events-none" />
    </motion.div>
  );
};

export default FullContextImage;
