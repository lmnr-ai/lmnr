"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { useSignalsBannerStore } from "./store";

export { SignalsBannerInfoButton } from "./info-button";

const STEPS = [
  {
    number: 1,
    title: "Create a Signal",
    description: "Specify a definition and structured output.",
  },
  {
    number: 2,
    title: "Run your Signal on traces",
    description: "Specify past traces with backfill, or run on future traces with triggers",
  },
  {
    number: 3,
    title: "Find insights",
    description: "See trace analysis in events, and see high-level patterns with clusters.",
  },
];

interface SignalsBannerProps {
  onCreateSignal?: () => void;
}

export default function SignalsBanner({ onCreateSignal }: SignalsBannerProps) {
  const { isBannerDismissed, dismiss } = useSignalsBannerStore();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <AnimatePresence initial={false}>
      {!isBannerDismissed && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="overflow-hidden"
        >
          <div className="pb-4">
            <div className="rounded-xl border bg-secondary overflow-hidden">
              {/* Top section */}
              <div className="flex h-[120px] items-end justify-between pl-6 pr-4 py-4">
                <p className="text-lg font-medium leading-5 text-foreground">
                  Signals answer any question,
                  <br />
                  from any trace, at scale.
                </p>
                <div className="flex flex-col items-end justify-between self-stretch">
                  <button
                    onClick={dismiss}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Dismiss banner"
                  >
                    <X className="size-4" />
                  </button>
                  <div className="flex items-center gap-2">
                    <a
                      href="https://laminar.sh/docs/signals"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium px-2 border border-input bg-background hover:bg-accent transition-colors h-[22px]"
                    >
                      Docs
                    </a>
                    {onCreateSignal && (
                      <Button variant="default" size="sm" onClick={onCreateSignal}>
                        Create a Signal
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Steps section */}
              <div className="@container border-t flex items-start justify-between gap-8 px-6 pt-4 pb-5">
                <p className="max-w-[300px] shrink-0 text-xs text-muted-foreground">
                  Our agent extracts structured insights from your traces to help you track outcomes, detect failures,
                  and identify behavioral patterns.
                </p>
                <div className="flex items-start gap-8 @max-[1000px]:hidden">
                  {STEPS.map((step, index) => (
                    <div
                      key={step.number}
                      className="flex min-w-0 shrink-0 gap-3 items-start"
                      style={{ width: [180, 240, 250][index] }}
                    >
                      <div className="flex items-center justify-center size-5 rounded bg-muted border text-xs text-secondary-foreground shrink-0">
                        {step.number}
                      </div>
                      <div className="flex flex-col pt-0.5">
                        <span className="text-xs text-primary-foreground">{step.title}</span>
                        <span className="text-xs text-muted-foreground whitespace-pre-line">{step.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
