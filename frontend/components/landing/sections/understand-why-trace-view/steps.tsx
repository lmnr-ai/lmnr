"use client";

import { type ReactNode } from "react";

import { DEMO_FIRST_LLM_SPAN_ID, DEMO_FIRST_SEARCH_SPAN_ID } from "../demo-trace";
import { useSelectAndRevealSpan } from "./use-select-and-reveal-span";

// ──────────────────────────────────────────────────────────────────────
// The narrative. Four steps, scrubbed by the section's scroll progress, all
// against the SAME trace (../demo-trace) — there is no second slide and no
// horizontal travel, so the right-hand panel never moves.
//
//   #  copy                              timeline  signals  stack  clusters
//   1  See clearly what your agent… (H2)     ✓         ·       ·        ·
//   2  Automatic failure detection  (H2)     ✓         ✓       ·        ·
//   3  Similar failures are ...     (H3)     ✓         ✓       ✓        ·
//   4  Has this failure occurred…   (H2)     ·         ·       ✓        ✓
//
// Step 1's timeline and transcript are NOT step-driven: they open the frame the
// section pins, i.e. once the panel has travelled up and stopped dead centre,
// so the run streams in under the opener rather than waiting for a hand-off.
// See ./index.
//
// Steps 3 and 4 keep the panel exactly where step 2 left it: the signal card
// flies out of it, and the flight's measured origin would chase a live
// transform if anything under it moved. See ./signal-stack.
//
// Add a step by appending to STEPS — STEP_COUNT and every scroll mapping
// follow. Note the last two steps SHARE one continuous gesture rather than
// getting a hand-off each, so a new step must go before them.
// ──────────────────────────────────────────────────────────────────────

export type StepNumber = 1 | 2 | 3 | 4;

interface Step {
  /** Step number rendered above the title. Only the two H2 "section roots"
   *  carry one; the H3 subsections in between are unnumbered, so the next
   *  section on the page picks up at "03.". */
  label?: string;
  /** H2 — a section root. */
  title?: string;
  /** H3 — a subsection of the H2 above it. */
  subtitle?: string;
  body: string;
  /** Desktop-only replacement for `body` carrying inline links into the trace
   *  view. Mobile has no store to select into, so it renders `body` instead —
   *  keep the two saying the same thing. */
  richBody?: ReactNode;
  footnote: { name: string; href: string };
}

const DOCS_TRACE_VIEW = "https://laminar.sh/docs/platform/viewing-traces";
const DOCS_SIGNALS = "https://laminar.sh/docs/signals/introduction";
const DOCS_CLUSTERS = "https://laminar.sh/docs/signals/clusters";

// Underlined inline button — scrolls the transcript on the right to the named
// span and highlights it.
const BodyLink = ({ spanId, label }: { spanId: string; label: string }) => {
  const selectAndRevealSpan = useSelectAndRevealSpan();
  return (
    <button
      type="button"
      onClick={() => selectAndRevealSpan(spanId)}
      className="underline underline-offset-2 decoration-foreground-400 hover:text-foreground-50 hover:decoration-foreground-200 transition-colors cursor-pointer"
    >
      {label}
    </button>
  );
};

const TraceViewBody = () => (
  <>
    Laminar automatically captures <BodyLink spanId={DEMO_FIRST_LLM_SPAN_ID} label="LLM calls" />,{" "}
    <BodyLink spanId={DEMO_FIRST_SEARCH_SPAN_ID} label="tool calls" />, sub-agents, costs, and tokens, and shows it in a
    readable transcript view.
  </>
);

export const STEPS: Record<StepNumber, Step> = {
  1: {
    label: "01.",
    title: "See clearly what\nyour agent is doing",
    body: "Laminar automatically captures LLM calls, tool calls, sub-agents, costs, and tokens, and shows it in a readable transcript view.",
    richBody: <TraceViewBody />,
    footnote: { name: "Trace view", href: DOCS_TRACE_VIEW },
  },
  2: {
    label: "02.",
    title: "Automatic\nfailure detection.",
    body: "Describe the failures you want to find in plain English and Laminar reads every run to surface them for you.",
    footnote: { name: "Signals", href: DOCS_SIGNALS },
  },
  // FLAG(copy): written to bridge into the "Has this failure occurred before?"
  // section below. The Figma frame for this step has no copy in it, so this is
  // a first draft rather than signed-off wording.
  3: {
    subtitle: "Similar failures are clustered",
    body: "Laminar runs the signal on every trace, then groups the matches.",
    footnote: { name: "Signals", href: DOCS_SIGNALS },
  },
  // Desktop only. On mobile the same copy heads its own standalone section
  // (../has-this-issue), which is why the wording is a section opener rather
  // than a continuation — see ../../index for the md gate.
  4: {
    label: "03.",
    title: "Has this failure\noccurred before?",
    body: "Laminar groups failures into named clusters and tracks each one over time. When a cluster stops recurring, Laminar resolves it, and reopens it if the issue returns.",
    footnote: { name: "Signal clusters", href: DOCS_CLUSTERS },
  },
};

export const STEP_NUMBERS = [1, 2, 3, 4] as const;
export const STEP_COUNT = STEP_NUMBERS.length;
