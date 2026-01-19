import { type GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";

export const googleThinkingModels = [
  "gemini:gemini-2.5-pro",
  "gemini:gemini-2.5-flash",
  "gemini:gemini-2.5-flash-lite",
] as const;

export const googleProviderOptionsSettings: Record<
  (typeof googleThinkingModels)[number],
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
