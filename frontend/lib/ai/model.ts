import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * Model tiers used across AI features (chat with trace, SQL generation, name generation).
 * Each tier maps to a specific model per provider.
 */
type ModelTier = "default" | "fast" | "lite";

const GEMINI_MODELS: Record<ModelTier, string> = {
  default: "gemini-3-flash-preview",
  fast: "gemini-3-flash-preview",
  lite: "gemini-3.1-flash-lite-preview",
};

const BEDROCK_MODELS: Record<ModelTier, string> = {
  default: "global.anthropic.claude-sonnet-4-6",
  fast: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  lite: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
};

type AIProvider = "gemini" | "bedrock";

function isGeminiConfigured(): boolean {
  return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

function isBedrockConfigured(): boolean {
  return (
    process.env.BEDROCK_ENABLED === "true" &&
    !!process.env.AWS_ACCESS_KEY_ID &&
    !!process.env.AWS_SECRET_ACCESS_KEY &&
    !!process.env.AWS_REGION
  );
}

function getActiveProvider(): AIProvider {
  if (isGeminiConfigured()) {
    return "gemini";
  }

  if (isBedrockConfigured()) {
    return "bedrock";
  }

  throw new Error(
    "No AI provider configured. Set GOOGLE_GENERATIVE_AI_API_KEY for Gemini, " +
      "or BEDROCK_ENABLED=true with AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION for Anthropic Bedrock."
  );
}

export function getLanguageModel(tier: ModelTier = "default"): LanguageModel {
  const provider = getActiveProvider();

  if (provider === "gemini") {
    const google = createGoogleGenerativeAI();
    return google(GEMINI_MODELS[tier]);
  }

  const bedrock = createAmazonBedrock();
  return bedrock(BEDROCK_MODELS[tier]);
}
