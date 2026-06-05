"use client";

import { motion } from "framer-motion";
import { type PropsWithChildren } from "react";

import { useToast } from "@/lib/hooks/use-toast";

// Minimal "flag" copy button poking out of a row's right edge, revealed on row
// hover: the wrapper's whileHover propagates variants to the flag (framer's
// parent-hover → child-animation mechanism), sliding it out with a quick fade
// after a 300ms hover-intent delay. Used on trace headers (Copy trace ID),
// span rows (Copy span ID), and LLM span rows (Copy prompt + a description
// line, via `description`) in the debugger trace list.
//
// The motion x animation sits on the flag while the positioning span owns the
// Tailwind -translate-y-1/2 — framer overwrites class transforms, so centering
// and slide must live on different elements.
const flagVariants = {
  hidden: {
    opacity: 0,
    x: -12,
    pointerEvents: "none" as const,
    transition: { duration: 0.05, ease: "easeOut" as const },
  },
  // Delay only on reveal — hover-out hides without the lag.
  visible: {
    opacity: 1,
    x: 0,
    pointerEvents: "auto" as const,
    transition: { delay: 0.3, duration: 0.05, ease: "easeOut" as const },
  },
};

export default function CopyFlag({
  label,
  description,
  toastTitle,
  value,
  children,
}: PropsWithChildren<{ label: string; description?: string; toastTitle: string; value: string }>) {
  const { toast } = useToast();

  return (
    <motion.div className="relative flex w-full" initial="hidden" whileHover="visible">
      <span className="absolute left-full top-1/2 z-10 ml-3 -translate-y-1/2">
        <motion.div variants={flagVariants} className="flex flex-col gap-2 max-w-[120px]">
          {description && <p className="text-xs text-muted-foreground w-full">{description}</p>}
          <button
            type="button"
            className="self-start whitespace-nowrap rounded-md border bg-secondary px-3 py-1 text-xs text-secondary-foreground hover:bg-muted"
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
        </motion.div>
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </motion.div>
  );
}
