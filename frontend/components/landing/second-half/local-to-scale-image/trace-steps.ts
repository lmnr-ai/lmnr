import { flatMap, times } from "lodash";

export type TraceStep =
  | { type: "bolt"; text: string }
  | { type: "llm"; expanded?: boolean; content?: string }
  | { type: "pricing" };

const baseSteps: TraceStep[] = [
  { type: "bolt", text: "navigated to https://laminar.sh" },
  { type: "llm", expanded: true, content: "Current state shows navigation links including Pricing." },
  { type: "bolt", text: "click" },
  { type: "llm", expanded: true, content: "Extracting pricing information from the page..." },
  { type: "bolt", text: "extracted pricing plans" },
  { type: "pricing" },
];

export const traceSteps: TraceStep[] = flatMap(times(13), () => baseSteps);
