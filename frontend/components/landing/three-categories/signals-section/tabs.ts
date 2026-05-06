import { type SignalTabKey } from "./signals-mock-ui/mock-data";

export type TabKey = SignalTabKey | "anything";

export const ANYTHING_PROMPT = "Track literally anything you're looking for, in plain English";

export const TABS: { key: TabKey; label: string; quote: string }[] = [
  {
    key: "detect-failures",
    label: "Detect failures",
    quote: "Analyze this trace for tool call failures, API errors, or repeated calls.",
  },
  {
    key: "identify-user-friction",
    label: "Identify user friction",
    quote: "Analyze this trace for signs of user frustration or friction. ",
  },
  {
    key: "monitor-safety",
    label: "User intent",
    quote: "Identify the user's underlying intent and whether they succeeded.",
  },
  {
    key: "anything",
    label: "Anything",
    quote: "",
  },
];
