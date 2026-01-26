"use client";

import { type MockSpan, SpanRow } from "./span-row";

interface ContentProps {
  mode: "tree" | "reader";
}

// Hardcoded trace data representing a browser agent workflow
const TRACE_DATA: MockSpan[] = [
  // Root span
  { id: "1", name: "agent.run", type: "DEFAULT", depth: 0, branchMask: [], hasChildren: true },

  // Step 1: Navigate
  { id: "2", name: "navigate", type: "TOOL", depth: 1, branchMask: [true], content: "navigated to https://laminar.sh" },

  // Step 2: First agent step
  { id: "3", name: "agent.step", type: "DEFAULT", depth: 1, branchMask: [true], hasChildren: true },
  {
    id: "4",
    name: "gemini-2.5-flash",
    type: "LLM",
    depth: 2,
    branchMask: [true, true],
    content:
      "I can see the Laminar homepage. Let me click on the Pricing link in the navigation to view their pricing plans.",
  },
  { id: "5", name: "click", type: "TOOL", depth: 2, branchMask: [true, false], content: "clicked 'Pricing' link" },

  // Step 3: Second agent step
  { id: "6", name: "agent.step", type: "DEFAULT", depth: 1, branchMask: [true], hasChildren: true },
  {
    id: "7",
    name: "gemini-2.5-flash",
    type: "LLM",
    depth: 2,
    branchMask: [true, true],
    content: "The pricing page has loaded. I can see three tiers: Free, Hobby, and Pro. Let me extract the details.",
  },
  {
    id: "8",
    name: "extract",
    type: "TOOL",
    depth: 2,
    branchMask: [true, false],
    content: "extracted pricing tier information",
  },

  // Step 4: Third agent step
  { id: "9", name: "agent.step", type: "DEFAULT", depth: 1, branchMask: [true], hasChildren: true },
  {
    id: "10",
    name: "gemini-2.5-flash",
    type: "LLM",
    depth: 2,
    branchMask: [true, true],
    content: "Extracting pricing information. The Free tier offers 1GB data with 15-day retention.",
  },
  {
    id: "11",
    name: "extract",
    type: "TOOL",
    depth: 2,
    branchMask: [true, false],
    content: "extracted Free tier details",
  },

  // Step 5: Fourth agent step
  { id: "12", name: "agent.step", type: "DEFAULT", depth: 1, branchMask: [true], hasChildren: true },
  {
    id: "13",
    name: "gemini-2.5-flash",
    type: "LLM",
    depth: 2,
    branchMask: [true, true],
    content: "Continuing extraction. The Hobby tier is $25/month with 2GB data and 30-day retention.",
  },
  {
    id: "14",
    name: "extract",
    type: "TOOL",
    depth: 2,
    branchMask: [true, false],
    content: "extracted Hobby tier details",
  },

  // Step 6: Fifth agent step
  { id: "15", name: "agent.step", type: "DEFAULT", depth: 1, branchMask: [false], hasChildren: true },
  {
    id: "16",
    name: "gemini-2.5-flash",
    type: "LLM",
    depth: 2,
    branchMask: [false, true],
    content: "Final extraction complete. I've gathered all pricing data and will now compile the summary.",
  },
  {
    id: "17",
    name: "write_file",
    type: "TOOL",
    depth: 2,
    branchMask: [false, false],
    content: "writing to pricing_summary.md",
  },
];

export function Content({ mode }: ContentProps) {
  return (
    <div className="bg-landing-surface-600 flex flex-col w-full">
      {TRACE_DATA.map((span) => (
        <SpanRow key={span.id} span={span} mode={mode} />
      ))}
    </div>
  );
}
