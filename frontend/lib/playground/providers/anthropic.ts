type EffortLevel = "low" | "medium" | "high" | "max";

export interface AnthropicBudgetConfig {
  type: "budget";
  min: number;
}

export interface AnthropicEffortConfig {
  type: "effort";
  levels: EffortLevel[];
}

export type AnthropicThinkingConfig = AnthropicBudgetConfig | AnthropicEffortConfig;

export const anthropicThinkingModels = [
  "claude-3-7-sonnet-20250219",
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-opus-4-1-20250805",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-fable-5",
  "claude-sonnet-5",
] as const;

export const anthropicProviderOptionsSettings: Record<
  (typeof anthropicThinkingModels)[number],
  { thinking: AnthropicThinkingConfig }
> = {
  "claude-3-7-sonnet-20250219": {
    thinking: { type: "budget", min: 1024 },
  },
  "claude-sonnet-4-20250514": {
    thinking: { type: "budget", min: 1024 },
  },
  "claude-opus-4-20250514": {
    thinking: { type: "budget", min: 1024 },
  },
  "claude-opus-4-1-20250805": {
    thinking: { type: "budget", min: 1024 },
  },
  "claude-haiku-4-5-20251001": {
    thinking: { type: "budget", min: 1024 },
  },
  "claude-sonnet-4-5-20250929": {
    thinking: { type: "budget", min: 1024 },
  },
  "claude-sonnet-4-6": {
    thinking: { type: "effort", levels: ["low", "medium", "high"] },
  },
  "claude-opus-4-6": {
    thinking: { type: "effort", levels: ["low", "medium", "high", "max"] },
  },
  "claude-opus-4-7": {
    thinking: { type: "effort", levels: ["low", "medium", "high", "max"] },
  },
  "claude-opus-4-8": {
    thinking: { type: "effort", levels: ["low", "medium", "high", "max"] },
  },
  "claude-fable-5": {
    thinking: { type: "effort", levels: ["low", "medium", "high", "max"] },
  },
  "claude-sonnet-5": {
    thinking: { type: "effort", levels: ["low", "medium", "high", "max"] },
  },
};
