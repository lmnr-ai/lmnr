"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import React, { type PropsWithChildren, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { LaminarLogo } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const STATIC_WILL_CHANGE = { willChange: "transform, opacity" } as const;

interface StepShellProps {
  stepIndex: number;
  totalSteps: number;
  title: string;
  description?: ReactNode;
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
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-background px-4 py-10 overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[40rem] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,hsl(var(--primary)/0.07),transparent_70%)]"
      />
      <div className="relative w-full max-w-2xl flex flex-col gap-6 my-auto">
        <div className="flex items-center justify-between gap-3 px-0.5">
          <LaminarLogo className="h-6 w-auto text-muted-foreground/70" fill="currentColor" />
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80 tabular-nums">
            Step <span className="text-foreground/80">{stepIndex + 1}</span>
            <span className="text-muted-foreground/50"> / {totalSteps}</span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-0.5 flex-1 rounded-full transition-colors duration-300",
                i <= stepIndex ? "bg-primary" : "bg-border"
              )}
            />
          ))}
        </div>

        <div className={cn("min-h-100 flex flex-col", className)}>
          <div className="flex flex-col gap-2 pt-2 pb-1">
            <h1 className="text-xl font-semibold tracking-tight text-secondary-foreground">{title}</h1>
            {description && <p className="text-[13px] text-muted-foreground leading-relaxed">{description}</p>}
          </div>
          <div className="flex flex-col gap-5 py-6 flex-1">{children}</div>
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <div>
              {onBack && (
                <Button
                  className="text-muted-foreground hover:text-foreground"
                  type="button"
                  variant="ghost"
                  onClick={onBack}
                  disabled={isSubmitting}
                >
                  <ArrowLeft className="size-3.5 mr-1" />
                  {backLabel}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {secondaryAction}
              {onNext && (
                <Button type="button" onClick={onNext} disabled={nextDisabled || isSubmitting}>
                  {nextLabel}
                  <span className="ml-1 inline-flex size-3.5 items-center justify-center">
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
                          <Loader2 className="size-3.5 animate-spin" />
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
                          <ArrowRight className="size-3.5" />
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
