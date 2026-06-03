"use client";

import { type PropsWithChildren } from "react";

import { useToast } from "@/lib/hooks/use-toast";

// Minimal "flag" copy button poking out of a row's right edge: wraps the row
// content in a relative container and absolutely positions the button at the
// vertical center. Used on trace headers (Copy trace ID) and span rows
// (Copy span ID) in the debugger trace list.
export default function CopyIdFlag({
  label,
  toastTitle,
  value,
  children,
}: PropsWithChildren<{ label: string; toastTitle: string; value: string }>) {
  const { toast } = useToast();

  return (
    <div className="relative flex w-full">
      <button
        type="button"
        className="absolute left-full top-1/2 z-10 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border bg-secondary px-3 py-1 text-xs text-secondary-foreground hover:bg-muted"
        onClick={async (e) => {
          // Rows have their own click behavior (expand toggle / span select).
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(value);
            toast({ title: toastTitle, duration: 1000 });
          } catch {
            // navigator.clipboard throws on non-https/non-localhost origins.
            toast({ variant: "destructive", title: "Failed to copy" });
          }
        }}
      >
        {label}
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
