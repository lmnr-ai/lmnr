import { type GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";

type ThinkingLevel = NonNullable<NonNullable<GoogleGenerativeAIProviderOptions["thinkingConfig"]>["thinkingLevel"]>;

export interface GoogleBudgetConfig {
  type: "budget";
  min: number;
  max: number;
}

export interface GoogleLevelConfig {
  type: "level";
  levels: ThinkingLevel[];
}

export type GoogleThinkingConfig = GoogleBudgetConfig | GoogleLevelConfig;

export const googleThinkingModels = [
  "gemini:gemini-2.5-pro",
  "gemini:gemini-2.5-flash",
  "gemini:gemini-2.5-flash-lite",
  "gemini:gemini-3-flash-preview",
  "gemini:gemini-3-pro-preview",
  "gemini:gemini-3.1-pro-preview",
  "gemini:gemini-3.1-flash-lite-preview",
] as const;

export const googleProviderOptionsSettings: Record<
  (typeof googleThinkingModels)[number],
  { thinkingConfig: GoogleThinkingConfig }
> = {
  "gemini:gemini-2.5-pro": {
    thinkingConfig: {
      type: "budget",
      min: 128,
      max: 32768,
    },
  },
  "gemini:gemini-2.5-flash": {
    thinkingConfig: {
      type: "budget",
      min: 0,
      max: 24576,
    },
  },
  "gemini:gemini-2.5-flash-lite": {
    thinkingConfig: {
      type: "budget",
      min: 512,
      max: 24576,
    },
  },
  "gemini:gemini-3-flash-preview": {
    thinkingConfig: {
      type: "level",
      levels: ["minimal", "low", "medium", "high"],
    },
  },
  "gemini:gemini-3-pro-preview": {
    thinkingConfig: {
      type: "level",
      levels: ["low", "high"],
    },
  },
  "gemini:gemini-3.1-pro-preview": {
    thinkingConfig: {
      type: "level",
      levels: ["low", "medium", "high"],
    },
  },
  "gemini:gemini-3.1-flash-lite-preview": {
    thinkingConfig: {
      type: "level",
      levels: ["minimal", "low", "medium", "high"],
    },
  },
};
