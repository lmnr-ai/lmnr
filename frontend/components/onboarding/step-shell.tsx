"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import React, { type PropsWithChildren, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { LaminarLogo } from "@/components/ui/icons";
import { useFeatureFlags } from "@/contexts/feature-flags-context.tsx";
import { Feature } from "@/lib/features/features.ts";
import { cn } from "@/lib/utils";

const STATIC_WILL_CHANGE = { willChange: "transform, opacity" } as const;

interface StepShellProps {
  stepIndex: number;
  totalSteps: number;
  title: string;
  description?: ReactNode;
  // Optional helper line shown right above the footer divider.
  hint?: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  isSubmitting?: boolean;
  secondaryAction?: ReactNode;
  className?: string;
}

export default function StepShell({
  stepIndex,
  totalSteps,
  title,
  description,
  hint,
  onBack,
  onNext,
  nextLabel = "Continue",
  backLabel = "Back",
  nextDisabled,
  isSubmitting,
  secondaryAction,
  className,
  children,
}: PropsWithChildren<StepShellProps>) {
  const featureFlags = useFeatureFlags();

  const isCloud = featureFlags[Feature.LAMINAR_CLOUD];

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-background px-4 py-10 overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[40rem] xl:h-[min(50rem,80vh)] 2xl:h-[min(60rem,85vh)] bg-[radial-gradient(ellipse_70%_55%_at_50%_0%,hsl(var(--primary)/0.22),hsl(var(--primary)/0.08)_45%,transparent_75%)] xl:bg-[radial-gradient(ellipse_75%_60%_at_50%_0%,hsl(var(--primary)/0.24),hsl(var(--primary)/0.09)_45%,transparent_75%)] 2xl:bg-[radial-gradient(ellipse_80%_65%_at_50%_0%,hsl(var(--primary)/0.26),hsl(var(--primary)/0.1)_45%,transparent_75%)]"
      />
      <div className="relative w-full max-w-2xl xl:max-w-3xl 2xl:max-w-4xl flex flex-col gap-6 xl:gap-8 my-auto">
        <div className="flex items-center justify-between gap-3 px-0.5">
          <LaminarLogo className="h-6 xl:h-7 2xl:h-8 w-auto text-muted-foreground/70" fill="currentColor" />
          {isCloud && (
            <span className="text-[11px] xl:text-xs uppercase tracking-[0.08em] text-muted-foreground/80 tabular-nums">
              Step <span className="text-foreground/80">{stepIndex + 1}</span>
              <span className="text-muted-foreground/50"> / {totalSteps}</span>
            </span>
          )}
        </div>

        {isCloud && (
          <div className="flex items-center gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 xl:h-1.5 flex-1 rounded-full transition-colors duration-300",
                  i <= stepIndex ? "bg-primary" : "bg-border"
                )}
              />
            ))}
          </div>
        )}
        <div className={cn("min-h-96 2xl:min-h-[28rem] flex flex-col", className)}>
          <div className="flex flex-col gap-2 pt-2 pb-1 xl:pt-3 xl:pb-2">
            <h1 className="text-xl md:text-2xl 2xl:text-3xl font-semibold tracking-tight text-secondary-foreground">
              {title}
            </h1>
            {description && (
              <p className="text-sm 2xl:text-base text-muted-foreground leading-relaxed">{description}</p>
            )}
          </div>
          <div className="flex flex-col gap-5 xl:gap-6 py-6 xl:py-8 flex-1">{children}</div>
          {isCloud && hint && (
            <p className="text-[13px] xl:text-sm text-muted-foreground leading-relaxed pb-3">{hint}</p>
          )}
          <div className="flex items-center justify-between gap-2 border-t pt-3 xl:pt-4">
            {onBack && (
              <Button
                className="h-8 text-muted-foreground hover:text-foreground xl:h-9 xl:text-sm"
                type="button"
                variant="ghost"
                onClick={onBack}
                disabled={isSubmitting}
              >
                <ArrowLeft className="size-3.5 xl:size-4 mr-1" />
                {backLabel}
              </Button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              {secondaryAction}
              {onNext && (
                <Button
                  className="h-8 2xl:h-9 2xl:text-sm 2xl:px-5"
                  type="button"
                  onClick={onNext}
                  disabled={nextDisabled || isSubmitting}
                >
                  {nextLabel}
                  <span className="ml-1 inline-flex size-3.5 xl:size-4 items-center justify-center">
                    <AnimatePresence mode="wait" initial={false}>
                      {isSubmitting ? (
                        <motion.span
                          key="loader"
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.6 }}
                          transition={{ duration: 0.12 }}
                          className="inline-flex"
                          style={STATIC_WILL_CHANGE}
                        >
                          <Loader2 className="size-3.5 xl:size-4 animate-spin" />
                        </motion.span>
                      ) : (
                        <motion.span
                          key="arrow"
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 4 }}
                          transition={{ duration: 0.12 }}
                          className="inline-flex"
                          style={STATIC_WILL_CHANGE}
                        >
                          <ArrowRight className="size-3.5 xl:size-4" />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
