import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * Model tiers used across AI features (chat with trace, SQL generation, name generation).
 * Each tier maps to a specific model per provider.
 */
type ModelTier = "default" | "fast" | "lite";

const GEMINI_MODELS: Record<ModelTier, string> = {
  default: "gemini-2.5-flash",
  fast: "gemini-3-flash-preview",
  lite: "gemini-2.5-flash-lite",
};

const BEDROCK_MODELS: Record<ModelTier, string> = {
  default: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
  fast: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
  lite: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
};

type AIProvider = "gemini" | "bedrock";

function getActiveProvider(): AIProvider {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return "gemini";
  }

  if (
    process.env.BEDROCK_ENABLED === "true" &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_REGION
  ) {
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
