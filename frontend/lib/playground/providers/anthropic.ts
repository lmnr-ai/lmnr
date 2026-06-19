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
  "anthropic:claude-3-7-sonnet-20250219",
  "anthropic:claude-sonnet-4-20250514",
  "anthropic:claude-opus-4-20250514",
  "anthropic:claude-opus-4-1-20250805",
  "anthropic:claude-haiku-4-5-20251001",
  "anthropic:claude-sonnet-4-5-20250929",
  "anthropic:claude-sonnet-4-6",
  "anthropic:claude-opus-4-6",
] as const;

export const anthropicProviderOptionsSettings: Record<
  (typeof anthropicThinkingModels)[number],
  { thinking: AnthropicThinkingConfig }
> = {
  "anthropic:claude-3-7-sonnet-20250219": {
    thinking: { type: "budget", min: 1024 },
  },
  "anthropic:claude-sonnet-4-20250514": {
    thinking: { type: "budget", min: 1024 },
  },
  "anthropic:claude-opus-4-20250514": {
    thinking: { type: "budget", min: 1024 },
  },
  "anthropic:claude-opus-4-1-20250805": {
    thinking: { type: "budget", min: 1024 },
  },
  "anthropic:claude-haiku-4-5-20251001": {
    thinking: { type: "budget", min: 1024 },
  },
  "anthropic:claude-sonnet-4-5-20250929": {
    thinking: { type: "budget", min: 1024 },
  },
  "anthropic:claude-sonnet-4-6": {
    thinking: { type: "effort", levels: ["low", "medium", "high"] },
  },
  "anthropic:claude-opus-4-6": {
    thinking: { type: "effort", levels: ["low", "medium", "high", "max"] },
  },
};
