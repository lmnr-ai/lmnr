"use client";

import { type ReactNode } from "react";

import { DEMO_FIRST_LLM_SPAN_ID, DEMO_FIRST_SEARCH_SPAN_ID } from "../demo-trace";
import { useSpanSelection } from "./mock/selection";

// Four steps scrubbed by scroll, all against one trace. Step 1's panel opens on
// the PIN, not a hand-off, and steps 3-4 leave it exactly where step 2 did.
// Append to STEPS to add one — but the last two share ONE gesture, so a new
// step has to go before them.

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
  /** The outbound link under the body — a full label, since the wording differs
   *  per step. Absent on steps that CONTINUE the one above them, where it would
   *  be the same link twice a hand's width apart. */
  learnMore?: { label: string; href: string };
}

const DOCS_TRACE_VIEW = "https://laminar.sh/docs/platform/viewing-traces";
const DOCS_SIGNALS = "https://laminar.sh/docs/signals/introduction";
const DOCS_CLUSTERS = "https://laminar.sh/docs/signals/clusters";

// Underlined inline button — scrolls the transcript on the right to the named
// span and highlights it.
const BodyLink = ({ spanId, label }: { spanId: string; label: string }) => {
  const { selectSpan } = useSpanSelection();
  return (
    <button
      type="button"
      onClick={() => selectSpan(spanId)}
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
    learnMore: { label: "Learn more about the trace view", href: DOCS_TRACE_VIEW },
  },
  2: {
    label: "02.",
    title: "Discover failures\nwithout defining them",
    body: "Laminar Signals analyze every agent run to surface failure modes you didn't anticipate.",
    learnMore: { label: "Learn more about Signals", href: DOCS_SIGNALS },
  },
  // FLAG(copy): written to bridge into the "Has this failure occurred before?"
  // section below. The Figma frame for this step has no copy in it, so this is
  // a first draft rather than signed-off wording.
  3: {
    subtitle: "",
    body: "Similar failures are clustered into distinct patterns to give you a high level overview.",
  },
  // Desktop only. On mobile the same copy heads its own standalone section
  // (../has-this-issue), which is why the wording is a section opener rather
  // than a continuation — see ../../index for the md gate.
  4: {
    label: "03.",
    //title: "Has this failure\noccurred before?",
    title: "Understand agent\nfailures at scale",
    body: "Signal clusters show the full distribution of your agent's failures and behaviors. Understand whether a newly reported issue has occurred before.",
    learnMore: { label: "Learn more about Signal Clusters", href: DOCS_CLUSTERS },
  },
};

export const STEP_NUMBERS = [1, 2, 3, 4] as const;
export const STEP_COUNT = STEP_NUMBERS.length;
