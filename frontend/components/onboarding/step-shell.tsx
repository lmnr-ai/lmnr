"use client";

import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import React, { type PropsWithChildren, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { LaminarLogo } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

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
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-2xl flex flex-col gap-6 my-auto">
        <div className="flex flex-col items-center gap-4">
          <LaminarLogo className="h-7 w-auto" fill="#b5b5b5" />
          <div className="w-full flex items-center gap-1.5 mt-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn("h-1 flex-1 rounded-full transition-colors", i <= stepIndex ? "bg-primary" : "bg-muted")}
              />
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            Step {stepIndex + 1} of {totalSteps}
          </span>
        </div>

        <div className={cn("rounded-xl border bg-secondary shadow-md overflow-hidden", className)}>
          <div className="flex flex-col gap-1.5 px-6 pt-6 pb-2">
            <h1 className="text-lg font-semibold text-secondary-foreground">{title}</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          <div className="flex flex-col gap-5 px-6 py-5">{children}</div>
          <div className="flex items-center justify-between gap-2 border-t px-6 py-4 bg-background/30">
            <div>
              {onBack && (
                <Button type="button" variant="ghost" onClick={onBack} disabled={isSubmitting}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  {backLabel}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {secondaryAction}
              {onNext && (
                <Button type="button" onClick={onNext} disabled={nextDisabled || isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    <>
                      {nextLabel}
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
