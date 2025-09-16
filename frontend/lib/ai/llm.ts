import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";

export const getModel = () => {
  if (process.env.PROVIDER?.toLowerCase()?.trim() === "google") {
    switch (process.env.GEMINI_MODEL) {
      case "gemini-2.5-flash-lite":
        return google("gemini-2.5-flash-lite");
      case "gemini-2.5-flash":
        return google("gemini-2.5-flash");
      case "gemini-2.5-pro":
        return google("gemini-2.5-pro");
      default:
        try {
          return google(process.env.GEMINI_MODEL!);
        } catch {
          return google("gemini-2.5-flash-lite");
        }
    }
  } else if (process.env.PROVIDER?.toLowerCase()?.trim() === "openai") {
    switch (process.env.OPENAI_MODEL) {
      case "gpt-4.1":
        return openai("gpt-4.1");
      case "gpt-4.1-mini":
        return openai("gpt-4.1-mini");
      case "gpt-4.1-nano":
        return openai("gpt-4.1-nano");
      case "o1":
        return openai("o1");
      case "o3-mini":
        return openai("o3-mini");
      default:
        try {
          return openai(process.env.OPENAI_MODEL!);
        } catch {
          return openai("gpt-4.1-nano");
        }
    }
  } else if (process.env.PROVIDER?.toLowerCase()?.trim() === "anthropic") {
    switch (process.env.ANTHROPIC_MODEL) {
      case "claude-sonnet-4":
        return anthropic("claude-sonnet-4-latest");
      case "claude-opus-4":
        return anthropic("claude-opus-4-latest");
      case "claude-3-5-haiku":
        return anthropic("claude-3-5-haiku-latest");
      case "claude-3-7-sonnet":
        return anthropic("claude-3-7-sonnet-latest");
      default:
        try {
          return anthropic(process.env.ANTHROPIC_MODEL!);
        } catch {
          return anthropic("claude-3-5-haiku-latest");
        }
    }
  }
  return google("gemini-2.0-flash-lite");
};
