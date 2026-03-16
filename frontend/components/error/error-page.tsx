"use client";

import * as Sentry from "@sentry/nextjs";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button.tsx";

interface ErrorPageProps {
  error: Error & { digest?: string };
  backAction: () => void;
  backLabel: string;
}

export default function ErrorPage({ error, backAction, backLabel }: ErrorPageProps) {
  const refreshIconRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const handleRetry = useCallback(() => {
    refreshIconRef.current?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
      duration: 400,
      easing: "ease-in-out",
    });
    setTimeout(() => window.location.reload(), 400);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="flex flex-col max-w-md w-full items-center gap-6">
        <div className="flex items-center justify-center rounded-full bg-destructive/10 size-16">
          <TriangleAlert className="size-7 text-destructive" />
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-semibold text-center text-foreground">Something went wrong</h1>
          <p className="text-sm text-center text-secondary-foreground leading-relaxed">
            An unexpected error occurred. Please try again, or go back.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-2">
          <Button
            onClick={backAction}
            className="group gap-2 pl-3 pr-5 active:scale-[0.97] transition-transform"
            size="lg"
            variant="outline"
          >
            <ArrowLeft className="size-4 transition-transform group-active:-translate-x-0.5" />
            {backLabel}
          </Button>
          <Button
            onClick={handleRetry}
            className="gap-2 pl-3 pr-5 active:scale-[0.97] transition-transform"
            size="lg"
            variant="default"
          >
            <RefreshCw ref={refreshIconRef} className="size-4" />
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
