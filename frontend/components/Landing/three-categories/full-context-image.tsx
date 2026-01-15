"use client";

import { cn } from "@/lib/utils";
import { useScroll, useTransform, motion } from "framer-motion";
import { useRef, useState, useEffect } from "react";

interface Props {
  className?: string;
}

const FullContextImage = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [scrollRange, setScrollRange] = useState(400);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center start"],
  });

  useEffect(() => {
    const calculateScrollRange = () => {
      if (contentRef.current && ref.current) {
        const contentHeight = contentRef.current.scrollHeight;
        const containerHeight = ref.current.clientHeight;
        const range = contentHeight - containerHeight;
        setScrollRange(range > 0 ? range : 0);
      }
    };

    calculateScrollRange();
    window.addEventListener("resize", calculateScrollRange);
    return () => window.removeEventListener("resize", calculateScrollRange);
  }, []);

  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.8, 1]);
  const translateY = useTransform(scrollYProgress, [0, 1], [0, -scrollRange]);

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
        <div className="bg-landing-surface-600 flex items-start h-full w-full">
          {/* Main content area */}
          <div className="flex flex-col items-start grow min-w-0 h-full">
            {/* Message row 1 - Navigation */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                {/* Chevron right */}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                  <path
                    d="M3.75 2.5L6.25 5L3.75 7.5"
                    stroke="rgb(95 97 102)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {/* Bolt icon */}
                <div className="bg-landing-primary-400/30 flex items-center p-1 rounded shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6.5 2L3 7h3l-.5 3 3.5-5H6l.5-3z" fill="rgb(146 148 156)" />
                  </svg>
                </div>
                <p className="font-sans text-xs text-landing-text-300">navigated to https://laminar.sh</p>
              </div>
            </div>

            {/* Message row 2 - LLM response */}
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                {/* Chevron down */}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                  <path
                    d="M2.5 3.75L5 6.25L7.5 3.75"
                    stroke="rgb(95 97 102)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {/* Message icon */}
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M10.5 5.5c0 2.5-2.5 4.5-5 4.5-.5 0-1-.1-1.5-.2L2 11l1.2-2c-.8-.8-1.2-1.8-1.2-2.5 0-2.5 2.5-4.5 5-4.5s5 2 5 4.5z"
                      fill="rgb(146 148 156)"
                    />
                  </svg>
                </div>
                <p className="font-sans text-xs text-landing-text-300">gpt-05-nano-2025-08-07</p>
              </div>
            </div>

            {/* Expanded content */}
            <div className="flex items-start justify-between pb-3 pl-[58px] pr-2 w-full">
              <p className="font-sans text-xs text-landing-text-500 leading-normal">
                Plan: From the Laminar homepage, click the Pricing link to load the pricing page. The on the pricing
                page, I will extract and describe the pricing plans.
              </p>
            </div>

            {/* Message row 3 - Click action */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                  <path
                    d="M3.75 2.5L6.25 5L3.75 7.5"
                    stroke="rgb(95 97 102)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="bg-landing-primary-400/30 flex items-center p-1 rounded shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6.5 2L3 7h3l-.5 3 3.5-5H6l.5-3z" fill="rgb(146 148 156)" />
                  </svg>
                </div>
                <p className="font-sans text-xs text-landing-text-300">click</p>
              </div>
            </div>

            {/* Message row 5 - Extract action */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                  <path
                    d="M3.75 2.5L6.25 5L3.75 7.5"
                    stroke="rgb(95 97 102)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="bg-landing-primary-400/30 flex items-center p-1 rounded shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6.5 2L3 7h3l-.5 3 3.5-5H6l.5-3z" fill="rgb(146 148 156)" />
                  </svg>
                </div>
                <p className="font-sans text-xs text-landing-text-300">
                  extracted pricing plans and their details on Laminar Pr...
                </p>
              </div>
            </div>

            {/* Message row 6 - LLM response */}
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                  <path
                    d="M2.5 3.75L5 6.25L7.5 3.75"
                    stroke="rgb(95 97 102)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M10.5 5.5c0 2.5-2.5 4.5-5 4.5-.5 0-1-.1-1.5-.2L2 11l1.2-2c-.8-.8-1.2-1.8-1.2-2.5 0-2.5 2.5-4.5 5-4.5s5 2 5 4.5z"
                      fill="rgb(146 148 156)"
                    />
                  </svg>
                </div>
                <p className="font-sans text-xs text-landing-text-300">gpt-05-nano-2025-08-07</p>
              </div>
            </div>

            {/* Pricing data */}
            <div className="flex items-start justify-between pb-3 pl-[58px] pr-2 w-full">
              <div className="font-sans text-xs text-landing-text-500 leading-normal">
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
              <div className="flex h-7 items-center px-3 w-full">
                <div className="flex gap-2 items-center">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                    <path
                      d="M2.5 3.75L5 6.25L7.5 3.75"
                      stroke="rgb(95 97 102)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="bg-[rgba(116,63,227,0.5)] flex items-center p-1 rounded shrink-0">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M10.5 5.5c0 2.5-2.5 4.5-5 4.5-.5 0-1-.1-1.5-.2L2 11l1.2-2c-.8-.8-1.2-1.8-1.2-2.5 0-2.5 2.5-4.5 5-4.5s5 2 5 4.5z"
                        fill="rgb(146 148 156)"
                      />
                    </svg>
                  </div>
                  <p className="font-sans text-xs text-landing-primary-400">gpt-05-nano-2025-08-07</p>
                </div>
              </div>
              <div className="flex items-start justify-between pb-3 pl-[58px] pr-2 w-full">
                <p className="font-sans text-xs text-landing-primary-400 leading-normal">
                  From the prior steps, we navigated to the Laminar pricing page and are now positioned to extract
                  pricing data. The user request to describe their pricing plans, so the immediate next action should be
                  to extract structured pricing.
                </p>
              </div>
            </div>

            {/* Message row 5 - Extract action */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                  <path
                    d="M3.75 2.5L6.25 5L3.75 7.5"
                    stroke="rgb(95 97 102)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="bg-landing-primary-400/30 flex items-center p-1 rounded shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6.5 2L3 7h3l-.5 3 3.5-5H6l.5-3z" fill="rgb(146 148 156)" />
                  </svg>
                </div>
                <p className="font-sans text-xs text-landing-text-300">
                  extracted pricing plans and their details on Laminar Pr...
                </p>
              </div>
            </div>

            {/* Message row 6 - LLM response */}
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                  <path
                    d="M2.5 3.75L5 6.25L7.5 3.75"
                    stroke="rgb(95 97 102)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M10.5 5.5c0 2.5-2.5 4.5-5 4.5-.5 0-1-.1-1.5-.2L2 11l1.2-2c-.8-.8-1.2-1.8-1.2-2.5 0-2.5 2.5-4.5 5-4.5s5 2 5 4.5z"
                      fill="rgb(146 148 156)"
                    />
                  </svg>
                </div>
                <p className="font-sans text-xs text-landing-text-300">gpt-05-nano-2025-08-07</p>
              </div>
            </div>

            {/* Pricing data */}
            <div className="flex items-start justify-between pb-3 pl-[58px] pr-2 w-full">
              <div className="font-sans text-xs text-landing-text-500 leading-normal">
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
            <div className="flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                  <path
                    d="M2.5 3.75L5 6.25L7.5 3.75"
                    stroke="rgb(95 97 102)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M10.5 5.5c0 2.5-2.5 4.5-5 4.5-.5 0-1-.1-1.5-.2L2 11l1.2-2c-.8-.8-1.2-1.8-1.2-2.5 0-2.5 2.5-4.5 5-4.5s5 2 5 4.5z"
                      fill="rgb(146 148 156)"
                    />
                  </svg>
                </div>
                <p className="font-sans text-xs text-landing-text-300">gpt-05-nano-2025-08-07</p>
              </div>
            </div>

            <div className="flex items-start justify-between pb-3 pl-[58px] pr-2 w-full">
              <p className="font-sans text-xs text-landing-text-500 leading-normal">
                We are on the Laminar pricing page nad have already retrieved detailed pricing data from the pagestate
                and read_state. The user asked to describe the pricing plans.
              </p>
            </div>

            {/* Writing action */}
            <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full">
              <div className="flex gap-2 items-center">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                  <path
                    d="M3.75 2.5L6.25 5L3.75 7.5"
                    stroke="rgb(95 97 102)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="bg-landing-primary-400/30 flex items-center p-1 rounded shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6.5 2L3 7h3l-.5 3 3.5-5H6l.5-3z" fill="rgb(146 148 156)" />
                  </svg>
                </div>
                <p className="font-sans text-xs text-landing-text-300">writing to pricing_summary.md</p>
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
