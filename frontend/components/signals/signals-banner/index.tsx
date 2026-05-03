"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useSignalsBannerStore } from "./store";

export { SignalsBannerInfoButton } from "./info-button";

const STEPS = [
  {
    number: 1,
    title: "Create a Signal",
    description: "Specify a definition and\nstructured output.",
  },
  {
    number: 2,
    title: "Run your Signal on traces",
    description: "Specify past traces with Jobs, or run\non future traces with Triggers",
  },
  {
    number: 3,
    title: "Find insights",
    description: "See trace analysis in Events, and see high-level\npatterns with Clusters.",
  },
];

interface SignalsBannerProps {
  onCreateSignal?: () => void;
}

export default function SignalsBanner({ onCreateSignal }: SignalsBannerProps) {
  const { isBannerDismissed, dismiss } = useSignalsBannerStore();

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
          <div className="rounded-xl border bg-secondary overflow-hidden">
            {/* Top section */}
            <div className="flex justify-between pl-6 pr-4 pt-4 pb-4">
              <div className="flex flex-col gap-2">
                <p className="text-xl font-medium leading-6 text-foreground">
                  Signals answer any question,
                  <br />
                  from any trace, at scale.
                </p>
                <p className="text-sm text-muted-foreground">
                  Our agent extracts structured insights from your traces to help you
                  <br />
                  track outcomes, detect failures, and identify behavioral patterns.
                </p>
              </div>
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
            <div className="border-t flex items-start gap-8 px-6 pt-4 pb-5">
              {STEPS.map((step) => (
                <div key={step.number} className="flex gap-3 items-start">
                  <div className="flex items-center justify-center size-5 rounded bg-muted border text-xs text-secondary-foreground shrink-0">
                    {step.number}
                  </div>
                  <div className="flex flex-col gap-1 pt-0.5">
                    <span className="text-xs text-primary-foreground">{step.title}</span>
                    <span className="text-xs text-muted-foreground whitespace-pre-line">{step.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
