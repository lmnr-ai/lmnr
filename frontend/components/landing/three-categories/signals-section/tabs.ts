import { type SignalTabKey } from "./signals-mock-ui/mock-data";

export type TabKey = SignalTabKey | "anything";

export const ANYTHING_PROMPT = "Track literally anything you're looking for, in plain English";

export const TABS: { key: TabKey; label: string; quote: string }[] = [
  {
    key: "detect-failures",
    label: "Detect failures",
    quote:
      "Analyze this trace for concrete issues: tool call failures, API errors, loops or repeated calls, wrong tool selection, logic errors, and abnormally slow or expensive spans.",
  },
  {
    key: "identify-user-friction",
    label: "Identify user friction",
    quote:
      "Analyze this session for signs of user frustration or friction. Look for confusion, repeated attempts, or poor user experience.",
  },
  {
    key: "monitor-safety",
    label: "User intent",
    quote:
      "Identify what the user was trying to accomplish in this session. Capture their underlying intent and whether they succeeded.",
  },
  {
    key: "anything",
    label: "Anything",
    quote: "",
  },
];
