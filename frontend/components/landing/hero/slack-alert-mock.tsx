"use client";
import { motion, type Variants } from "framer-motion";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** When provided, the alert fades + scales in via the parent motion tree at this delay. */
  delay?: number;
  /** Optional top position (px). Pair with `translateY(-50%)` baked into the variants. */
  top?: number;
}

// translateY(-50%) is baked in so the element's vertical centre lands exactly on
// the `top` value passed in. Keeping it inside the variants lets framer-motion
// compose it with `scale` without fighting an inline CSS `transform`.
const ALERT_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.7, y: "-50%" },
  visible: (delay: number) => ({
    opacity: 1,
    scale: 1,
    y: "-50%",
    transition: { delay, duration: 0.25, ease: "easeOut" },
  }),
};

const SlackAlertMock = ({ className, delay, top }: Props) => (
    <motion.div
      variants={delay !== undefined ? ALERT_VARIANTS : undefined}
      custom={delay}
      style={{ transformOrigin: "left center", top }}
      className={cn(
        "flex gap-3 items-start overflow-hidden rounded border border-landing-surface-500 px-3 py-2.5 bg-landing-surface-600 w-[470px] max-w-full shadow-md",
        className
      )}
    >
      <div className="shrink-0 size-8 bg-landing-surface-700 rounded flex items-center justify-center">
        <svg width="60" height="60" viewBox="0 0 76 76" fill="none" className="size-4">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M1.32507 73.4886C0.00220402 72.0863 0.0802819 69.9867 0.653968 68.1462C3.57273 58.7824 5.14534 48.8249 5.14534 38.5C5.14534 27.8899 3.48464 17.6677 0.408998 8.0791C-0.129499 6.40029 -0.266346 4.50696 0.811824 3.11199C2.27491 1.21902 4.56777 0 7.14535 0H37.1454C58.1322 0 75.1454 17.0132 75.1454 38C75.1454 58.9868 58.1322 76 37.1454 76H7.14535C4.85185 76 2.78376 75.0349 1.32507 73.4886Z"
            fill="var(--color-landing-text-400)"
          />
        </svg>
      </div>

      <div className="flex flex-1 flex-col gap-3 items-start min-w-0 overflow-hidden">
        <div className="flex flex-col gap-1 w-full">
          <div className="flex items-center gap-1 w-full whitespace-nowrap font-sans text-xs">
            <p className="text-landing-text-200">Laminar</p>
            <div className="bg-landing-surface-500 rounded px-1 py-0.5 flex items-center justify-center">
              <p className="text-[8px] leading-none text-landing-text-200">APP</p>
            </div>
            <p className="text-landing-text-300">3:18 pm</p>
          </div>

          <div className="flex gap-0.5 items-center font-sans text-xs">
            <div className="bg-muted border border-landing-surface-400 rounded px-1.5 py-px">
              <p className="text-primary whitespace-nowrap">Failure</p>
            </div>
            <p className="text-landing-text-200 whitespace-nowrap">: New Event</p>
          </div>
        </div>

        <p className="font-sans text-xs text-landing-text-200 w-full">
          {`Agent on feat/dashboards claimed the task was done but never ran the tests it promised. CI is likely failing.`}
        </p>

        <div className="flex flex-row gap-2 items-center">
          <div className="bg-landing-surface-500 px-2 py-1 rounded">
            <p className="font-sans text-xs text-landing-text-200">View trace</p>
          </div>
          <div className="bg-landing-surface-500 px-2 py-1 rounded">
            <p className="font-sans text-xs text-landing-text-200">View similar events</p>
          </div>
        </div>
      </div>
    </motion.div>
  );

export default SlackAlertMock;
