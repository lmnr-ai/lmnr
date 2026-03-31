import { type AnthropicProviderOptions } from "@ai-sdk/anthropic";

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
  Record<keyof Pick<AnthropicProviderOptions, "thinking">, { min: number }>
> = {
  "anthropic:claude-3-7-sonnet-20250219": {
    thinking: {
      min: 1024,
    },
  },
  "anthropic:claude-sonnet-4-20250514": {
    thinking: {
      min: 1024,
    },
  },
  "anthropic:claude-opus-4-20250514": {
    thinking: {
      min: 1024,
    },
  },
  "anthropic:claude-opus-4-1-20250805": {
    thinking: {
      min: 1024,
    },
  },
  "anthropic:claude-haiku-4-5-20251001": {
    thinking: {
      min: 1024,
    },
  },
  "anthropic:claude-sonnet-4-5-20250929": {
    thinking: {
      min: 1024,
    },
  },
  "anthropic:claude-sonnet-4-6": {
    thinking: {
      min: 1024,
    },
  },
  "anthropic:claude-opus-4-6": {
    thinking: {
      min: 1024,
    },
  },
};
