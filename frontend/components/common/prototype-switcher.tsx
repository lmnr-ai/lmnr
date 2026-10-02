"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect } from "react";

interface PrototypeSwitcherProps {
  /** URL search param that holds the active variant key. */
  param: string;
  variants: { key: string; label: string }[];
}

const isEditable = (el: Element | null) =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);

// Dev-only floating bar for flipping between prototype variants. Alt+←/→ cycles; plain arrows are
// left alone because the app already binds them (trace view, tables).
const PrototypeSwitcher = ({ param, variants }: PrototypeSwitcherProps) => {
  const [current, setCurrent] = useQueryState(param, parseAsString.withDefault(variants[0]?.key ?? ""));
  const index = Math.max(
    variants.findIndex((v) => v.key === current),
    0
  );

  const step = useCallback(
    (delta: number) => setCurrent(variants[(index + delta + variants.length) % variants.length].key),
    [index, setCurrent, variants]
  );

  useEffect(() => {
    // Hooks run before the production early-return below, so the listener needs its own guard.
    if (process.env.NODE_ENV === "production") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || isEditable(document.activeElement)) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step]);

  if (process.env.NODE_ENV === "production" || variants.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1 rounded-full bg-foreground text-background shadow-lg px-1 py-1 text-xs font-medium">
      <button
        aria-label="Previous variant"
        onClick={() => step(-1)}
        className="rounded-full p-1 hover:bg-background/20"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-2 tabular-nums">
        {variants[index].key} ({variants[index].label})
      </span>
      <button aria-label="Next variant" onClick={() => step(1)} className="rounded-full p-1 hover:bg-background/20">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
};

export default PrototypeSwitcher;
