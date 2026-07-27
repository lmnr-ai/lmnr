"use client";

import * as Sentry from "@sentry/nextjs";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/utils";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

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
            onClick={() => {
              window.location.href = withBasePath("/projects");
            }}
            className="gap-2 pl-3 pr-5"
            size="lg"
            variant="outline"
          >
            <ArrowLeft data-icon="inline-start" className="size-4" />
            Back
          </Button>
          <Button onClick={() => reset()} className="gap-2 pl-3 pr-5" size="lg" variant="default">
            <RefreshCw data-icon="inline-start" className="size-4" />
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
