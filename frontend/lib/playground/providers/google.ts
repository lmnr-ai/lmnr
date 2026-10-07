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
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
] as const;

export const googleProviderOptionsSettings: Record<
  (typeof googleThinkingModels)[number],
  { thinkingConfig: GoogleThinkingConfig }
> = {
  "gemini-2.5-pro": {
    thinkingConfig: {
      type: "budget",
      min: 128,
      max: 32768,
    },
  },
  "gemini-2.5-flash": {
    thinkingConfig: {
      type: "budget",
      min: 0,
      max: 24576,
    },
  },
  "gemini-2.5-flash-lite": {
    thinkingConfig: {
      type: "budget",
      min: 512,
      max: 24576,
    },
  },
  "gemini-3-flash-preview": {
    thinkingConfig: {
      type: "level",
      levels: ["minimal", "low", "medium", "high"],
    },
  },
  "gemini-3-pro-preview": {
    thinkingConfig: {
      type: "level",
      levels: ["low", "high"],
    },
  },
  "gemini-3.1-pro-preview": {
    thinkingConfig: {
      type: "level",
      levels: ["low", "medium", "high"],
    },
  },
  "gemini-3.1-flash-lite-preview": {
    thinkingConfig: {
      type: "level",
      levels: ["minimal", "low", "medium", "high"],
    },
  },
  "gemini-3.5-flash": {
    thinkingConfig: {
      type: "level",
      levels: ["minimal", "low", "medium", "high"],
    },
  },
  "gemini-3.5-flash-lite": {
    thinkingConfig: {
      type: "level",
      levels: ["minimal", "low", "medium", "high"],
    },
  },
};
