import { type SignalTabKey } from "@/components/landing/sections/clusters-mock-data";

export type TabKey = SignalTabKey | "anything";

export const ANYTHING_PROMPT = "Track literally anything you're looking for, in plain English";

export const TABS: { key: TabKey; label: string; quote: string }[] = [
  {
    key: "detect-failures",
    label: "Detect failure",
    quote: "Analyze this trace for tool call failures, API errors, or repeated calls.",
  },
  {
    key: "identify-user-friction",
    label: "User friction",
    quote: "Analyze this trace for signs of user frustration or friction. ",
  },
  {
    key: "anything",
    label: "Anything",
    quote: "",
  },
];
