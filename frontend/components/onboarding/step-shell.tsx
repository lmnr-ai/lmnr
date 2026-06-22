"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import Image from "next/image";
import { type PropsWithChildren, type ReactNode } from "react";

import logo from "@/assets/logo/laminar-wordmark.svg";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  centerContent?: boolean;
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
  centerContent,
  children,
}: PropsWithChildren<StepShellProps>) {
  const featureFlags = useFeatureFlags();

  const isCloud = featureFlags[Feature.LAMINAR_CLOUD];

  return (
    <div className="relative h-svh w-full flex items-stretch md:items-center justify-center py-4 md:py-6 lg:py-8 overflow-hidden">
      <div className="relative w-full max-w-2xl xl:max-w-3xl 2xl:max-w-4xl flex flex-col gap-4 md:gap-6 xl:gap-8 md:h-[40rem] xl:h-[44rem] 2xl:h-[48rem] md:max-h-[calc(100svh-3rem)] lg:max-h-[calc(100svh-7rem)]">
        <div className="flex items-center justify-between gap-3 px-4 shrink-0">
          <Image
            alt="Laminar logo"
            src={logo}
            className="w-[100px] lg:w-28 2xl:w-32 h-auto md:-translate-y-0.5"
            priority
          />
          {isCloud && (
            <span className="text-[11px] xl:text-xs uppercase tracking-[0.08em] text-muted-foreground/80 tabular-nums">
              Step <span className="text-foreground/80">{stepIndex + 1}</span>
              <span className="text-muted-foreground/50"> / {totalSteps}</span>
            </span>
          )}
        </div>

        {isCloud && (
          <div className="flex items-center gap-1 px-4 shrink-0">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-300",
                  i <= stepIndex ? "bg-primary" : "bg-border"
                )}
              />
            ))}
          </div>
        )}
        <div className={cn("flex-1 min-h-0 flex flex-col", className)}>
          <div className="flex flex-col gap-2 pt-2 pb-1 xl:pt-3 xl:pb-2 px-4 shrink-0">
            <h1 className="text-xl md:text-2xl 2xl:text-3xl font-semibold tracking-tight text-secondary-foreground">
              {title}
            </h1>
            {description && <p className="text-sm 2xl:text-base text-secondary-foreground">{description}</p>}
          </div>
          <ScrollArea
            className={cn(
              "flex-1 min-h-0 px-4 py-4 sm:py-6 xl:py-8",
              centerContent && "[&>[data-radix-scroll-area-viewport]>div]:!h-full"
            )}
          >
            <div
              className={cn(
                centerContent
                  ? "flex h-full flex-col items-center justify-center gap-3"
                  : "flex flex-col gap-5 xl:gap-6"
              )}
            >
              {children}
            </div>
          </ScrollArea>
          {isCloud && hint && (
            <p className="text-[13px] xl:text-sm text-muted-foreground leading-relaxed pb-3 px-4 shrink-0">{hint}</p>
          )}
          <div className="flex items-center justify-between gap-2 border-t pt-3 xl:pt-4 mx-4 shrink-0">
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
