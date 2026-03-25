import { type GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";

export const gemini25ThinkingModels = [
  "gemini:gemini-2.5-pro",
  "gemini:gemini-2.5-flash",
  "gemini:gemini-2.5-flash-lite",
] as const;

export const gemini3ThinkingModels = [
  "gemini:gemini-3-flash-preview",
  "gemini:gemini-3-pro",
  "gemini:gemini-3.1-flash-lite-preview",
] as const;

export const googleThinkingModels = [...gemini25ThinkingModels, ...gemini3ThinkingModels] as const;

export const gemini25ProviderOptionsSettings: Record<
  (typeof gemini25ThinkingModels)[number],
  Record<keyof Pick<GoogleGenerativeAIProviderOptions, "thinkingConfig">, { min: number; max: number }>
> = {
  "gemini:gemini-2.5-pro": {
    thinkingConfig: {
      min: 128,
      max: 32768,
    },
  },
  "gemini:gemini-2.5-flash": {
    thinkingConfig: {
      min: 0,
      max: 24576,
    },
  },
  "gemini:gemini-2.5-flash-lite": {
    thinkingConfig: {
      min: 512,
      max: 24576,
    },
  },
};

export const gemini3ThinkingLevels = ["minimal", "low", "medium", "high"] as const;

export const gemini3SupportedThinkingLevels: Record<
  (typeof gemini3ThinkingModels)[number],
  readonly (typeof gemini3ThinkingLevels)[number][]
> = {
  "gemini:gemini-3-flash-preview": ["minimal", "low", "medium", "high"],
  "gemini:gemini-3-pro": ["low", "high"],
  "gemini:gemini-3.1-flash-lite-preview": ["minimal", "low", "medium", "high"],
};

export const googleProviderOptionsSettings = gemini25ProviderOptionsSettings;
