"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

// POC layout variants for the evals-page revamp brainstorm (branch-only chrome).
// "compact" is the baseline (current layout). The others recompose the page.
export const POC_VARIANTS = [
  "compact",
  "compact-v1",
  "trace-first",
  "history",
  "patterns",
  "morph",
  "bottom-dock",
  "hover-reveal",
  "hover-flyout",
  "hover-pin",
] as const;
export type PocVariant = (typeof POC_VARIANTS)[number];

export const VARIANT_INFO: Record<PocVariant, { label: string; description: string }> = {
  compact: { label: "Compact v0", description: "Merged header, inline score cards (frozen baseline)" },
  "compact-v1": { label: "Compact v1", description: "Classic score cards, label column, pinned left" },
  "trace-first": { label: "Trace-first", description: "Table as sidebar, trace view gets the screen" },
  history: { label: "History", description: "Trace-first + datapoint scores across runs" },
  patterns: { label: "Patterns", description: "Trace-first + mocked LLM insights" },
  morph: { label: "Morph", description: "Width-adaptive table, drag = breadth↔depth" },
  "bottom-dock": { label: "Bottom dock", description: "Full-width table docked under the trace" },
  "hover-reveal": { label: "Hover reveal", description: "Sidenav morphs into full table on hover" },
  "hover-flyout": { label: "Hover flyout", description: "Full table slides out beside the sidenav" },
  "hover-pin": { label: "Hover pin", description: "Hover peeks, pin locks the full table" },
};

export function usePocVariant() {
  const [variant, setVariant] = useQueryState(
    "pocVariant",
    parseAsStringLiteral(POC_VARIANTS).withDefault("compact-v1")
  );
  return { variant, setVariant };
}
