"use client";

import { type ReactNode } from "react";

import { useSelectAndRevealSpan } from "./use-select-and-reveal-span";

// ──────────────────────────────────────────────────────────────────────
// The narrative. Six steps, scrubbed by the section's scroll progress.
//
//   #  copy                              view          t1 timeline  t2 timeline
//   1  Understand your agent runs  (H2)  trace 1            ·            ✓
//   2  A clear, concise view       (H3)  trace 1            ✓            ✓
//   3  Built for complex agents    (H3)  trace 2            ✓            ✓
//   4  Ask any question about ...  (H3)  trace 2 + chat     ✓            ·
//   5  Automatic failure detection (H2)  trace 2 + signals  ✓            ·
//   6  Similar failures are ...    (H3)  signal stack       ✓            ·
//
// Step 6 keeps `view: "trace2"` on purpose even though the trace fades out
// under it: the tray must NOT move while the signal card flies out of it, or
// the flight's measured origin would be chasing a live transform. See
// ./signal-stack.
//
// The timeline columns are wired in index.tsx via each panel's `showTimeline`.
//
// `view` is the only thing that positions the tray; everything else on the
// right (chat width, signals card) is derived from the step number. Add a
// step by appending to STEPS — STEP_COUNT and every scroll mapping follow.
// ──────────────────────────────────────────────────────────────────────

// Trace 1 — the short, legible run that carries steps 1-2.
// Trace 2 — the deep, expensive run that carries steps 3-5. Its span IDs are
// load-bearing (signal-event-card.tsx chips + ask-ai.tsx links point into it);
// swapping it means re-deriving those too.
export const SIMPLE_TRACE_ID = "f6593456-83c6-3c42-12dd-74cea3f22265";
export const COMPLEX_TRACE_ID = "f4a22e85-089a-0959-fd1e-3002e236e42f";

// Spans inside SIMPLE_TRACE_ID — a four-span run: `ai.streamText` root, an LLM,
// a `web_search` tool, then the answering LLM. All top level, so no subagent
// expansion is needed. It deliberately has NO sub-agent: that is trace 2's job
// (step 3), and step 2's copy only names what this run actually contains.
// FLAG: re-derive these whenever SIMPLE_TRACE_ID changes — a stale ID makes the
// inline body links no-op silently.
const SIMPLE_LLM_SPAN_ID = "00000000-0000-0000-326f-ab066d5d9bf9";
const SIMPLE_TOOL_SPAN_ID = "00000000-0000-0000-53b2-a2fe8f8931d8";

// NOTE: trace 1 deliberately has NO auto-selected span. The whole run fits on
// screen, so a highlight nobody asked for is pure noise — selection here is
// only ever driven by clicking one of the body links below.

export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6;

/** Which slide of the tray sits in the frame. */
export type StepView = "trace1" | "trace2" | "trace2Chat";

interface Step {
  view: StepView;
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
const DOCS_CHAT = "https://laminar.sh/docs/platform/viewing-traces#chat-with-trace";
const DOCS_SIGNALS = "https://laminar.sh/docs/signals/introduction";

// Underlined inline button — scrolls the transcript on the right to the named
// span and highlights it. Resolves against the OUTER (trace 1) store, which is
// the one wrapping the whole section.
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

const ClearConciseBody = () => (
  <>
    Laminar makes the agent run easily navigable by surfacing input,{" "}
    <BodyLink spanId={SIMPLE_LLM_SPAN_ID} label="LLM reasoning" /> and{" "}
    <BodyLink spanId={SIMPLE_TOOL_SPAN_ID} label="tool calls" /> in a readable transcript and timeline.
  </>
);

export const STEPS: Record<StepNumber, Step> = {
  1: {
    view: "trace1",
    label: "01.",
    title: "Understand your\nagent runs.",
    body: "Every run lands in Laminar with reasoning, tool calls, sub-agents, system prompts, costs, and tokens.",
    footnote: { name: "Trace view", href: DOCS_TRACE_VIEW },
  },
  2: {
    view: "trace1",
    subtitle: "A clear, concise view",
    body: "Laminar makes the agent run easily navigable by surfacing input, LLM reasoning and tool calls in a readable transcript and timeline.",
    richBody: <ClearConciseBody />,
    footnote: { name: "Transcript view", href: DOCS_TRACE_VIEW },
  },
  3: {
    view: "trace2",
    subtitle: "Built for complex agents",
    body: "Nested sub-agents, thousands of steps, millions of tokens. Laminar keeps the whole run readable.",
    footnote: { name: "Transcript view", href: DOCS_TRACE_VIEW },
  },
  4: {
    view: "trace2Chat",
    subtitle: "Ask any question about your agent runs.",
    body: "Dive deep into any issue within the agent run by simply asking. Get answers that reference specific context that you can jump to directly.",
    footnote: { name: "Ask AI", href: DOCS_CHAT },
  },
  5: {
    view: "trace2",
    label: "02.",
    title: "Automatic\nfailure detection.",
    body: "Describe the failures you want to find in plain English and Laminar reads every run to surface them for you.",
    footnote: { name: "Signals", href: DOCS_SIGNALS },
  },
  // FLAG(copy): written to bridge into the "Has this failure occurred before?"
  // section below. The Figma frame for this step has no copy in it, so this is
  // a first draft rather than signed-off wording.
  6: {
    view: "trace2",
    subtitle: "Similar failures are clustered",
    body: "Laminar runs the signal on every trace, then groups the matches.",
    footnote: { name: "Signals", href: DOCS_SIGNALS },
  },
};

export const STEP_NUMBERS = [1, 2, 3, 4, 5, 6] as const;
export const STEP_COUNT = STEP_NUMBERS.length;
