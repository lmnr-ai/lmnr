// PROTOTYPE — throwaway route for tuning the shared error page.
"use client";

import { useDialKit } from "dialkit";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCallback, useRef } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";

import FourOhFourScene from "../prototype/four-oh-four/scene";

export default function SomethingWentWrongPrototypePage() {
  const refreshIconRef = useRef<SVGSVGElement>(null);
  const { message, buttonSize, horizontalPadding } = useDialKit(
    "Error actions",
    {
      message: {
        text: "An unexpected error occurred",
        fontSize: [24, 16, 64, 1],
        tracking: [0, -0.1, 0.3, 0.01],
        color: {
          type: "select" as const,
          options: ["50", "100", "200", "300", "400", "500", "600"].map((step) => ({
            label: `foreground-${step}`,
            value: `var(--color-foreground-${step})`,
          })),
          default: "var(--color-foreground-100)",
        },
      },
      buttonSize: {
        type: "select" as const,
        options: [
          { label: "Medium", value: "md" },
          { label: "Large", value: "lg" },
        ],
        default: "lg",
      },
      horizontalPadding: [20, 4, 48, 1],
    },
    { id: "something-went-wrong-actions-v3", persist: true }
  );
  const size = buttonSize as ButtonProps["size"];

  const handleRetry = useCallback(() => {
    refreshIconRef.current?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
      duration: 400,
      easing: "ease-in-out",
    });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-10">
        <FourOhFourScene showHeading={false} />
        <div className="flex flex-col items-center gap-2">
          <p className="text-center text-2xl text-primary-foreground">Something went wrong</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button
            variant="outline"
            size={size}
            onClick={() => window.history.back()}
            style={{ paddingInline: horizontalPadding }}
            className="group gap-2 bg-transparent hover:bg-surface-up-2 active:bg-surface-up-4"
          >
            <ArrowLeft className="size-4 transition-transform group-active:-translate-x-0.5" />
            Back
          </Button>
          <Button
            variant="outline"
            size={size}
            onClick={handleRetry}
            style={{ paddingInline: horizontalPadding }}
            className="gap-2 bg-transparent hover:bg-surface-up-2 active:bg-surface-up-4"
          >
            <RefreshCw ref={refreshIconRef} className="size-4" />
            Retry
          </Button>
        </div>
      </div>
    </main>
  );
}
