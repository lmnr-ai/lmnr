import { create } from "zustand";

// Static class strings so Tailwind generates them. Keys are what the dial offers.
export const INPUT_BORDER_COLORS = {
  // blue-400/70 is the trace view Input item's icon color.
  "blue-400/70": "border-blue-400/70",
  primary: "border-primary",
  "llm-foreground": "border-llm-foreground",
  "blue-icon": "border-[var(--blue-icon-background)]",
  "cyan-icon": "border-[var(--cyan-icon-background)]",
  "green-icon": "border-[var(--green-icon-background)]",
  "purple-icon": "border-[var(--purple-icon-background)]",
  "pink-icon": "border-[var(--pink-icon-background)]",
  "yellow-icon": "border-[var(--yellow-icon-background)]",
  "red-icon": "border-[var(--red-icon-background)]",
  "slate-icon": "border-[var(--slate-icon-background)]",
  "muted-foreground": "border-muted-foreground",
  "secondary-foreground": "border-secondary-foreground",
  border: "border-border",
  destructive: "border-destructive",
  "emphasis-0.5": "border-emphasis-0.5",
  "emphasis-1": "border-emphasis-1",
  "emphasis-2": "border-emphasis-2",
  "emphasis-3": "border-emphasis-3",
  "emphasis-4": "border-emphasis-4",
  "emphasis-5": "border-emphasis-5",
  "emphasis-6": "border-emphasis-6",
  "emphasis-7": "border-emphasis-7",
  "emphasis-8": "border-emphasis-8",
  "emphasis-9": "border-emphasis-9",
  "emphasis-10": "border-emphasis-10",
} as const;

export type InputBorderColor = keyof typeof INPUT_BORDER_COLORS;

interface FirstInputStyleState {
  borderColor: InputBorderColor;
  showBorder: boolean;
  set: (next: { borderColor: InputBorderColor; showBorder: boolean }) => void;
}

/** Prototype knobs for the sessions table's Input cell, driven by FirstInputDial. */
export const useFirstInputStyle = create<FirstInputStyleState>()((set) => ({
  borderColor: "blue-400/70",
  showBorder: true,
  set: (next) => set(next),
}));
