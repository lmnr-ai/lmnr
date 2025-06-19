import { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";

export const googleThinkingModels = [
  "gemini:gemini-2.5-flash-preview-05-20",
  "gemini:gemini-2.5-pro-exp-03-25",
  "gemini:gemini-2.5-pro-preview-05-06",
  "gemini:gemini-2.5-pro-preview-06-05",
] as const;

export const googleProviderOptionsSettings: Record<
  (typeof googleThinkingModels)[number],
  Record<keyof Pick<GoogleGenerativeAIProviderOptions, "thinkingConfig">, { min: number; max: number }>
> = {
  "gemini:gemini-2.5-pro-preview-06-05": {
    thinkingConfig: {
      min: 128,
      max: 32768,
    },
  },
  "gemini:gemini-2.5-pro-preview-05-06": {
    thinkingConfig: {
      min: 128,
      max: 32768,
    },
  },
  "gemini:gemini-2.5-pro-exp-03-25": {
    thinkingConfig: {
      min: 128,
      max: 32768,
    },
  },
  "gemini:gemini-2.5-flash-preview-05-20": {
    thinkingConfig: {
      min: 0,
      max: 24576,
    },
  },
};
