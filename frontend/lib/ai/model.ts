import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
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

type AIProvider = "gemini" | "bedrock" | "openai-compatible";

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

function isOpenAICompatibleConfigured(): boolean {
  return !!process.env.OPENAI_COMPATIBLE_BASE_URL && !!process.env.OPENAI_COMPATIBLE_MODEL;
}

function getOpenAICompatibleModel(tier: ModelTier): string {
  const baseModel = process.env.OPENAI_COMPATIBLE_MODEL;
  if (!baseModel) {
    throw new Error("OPENAI_COMPATIBLE_MODEL is required when using the OpenAI-compatible provider.");
  }
  const fast = process.env.OPENAI_COMPATIBLE_MODEL_FAST || baseModel;
  const lite = process.env.OPENAI_COMPATIBLE_MODEL_LITE || fast;
  if (tier === "fast") return fast;
  if (tier === "lite") return lite;
  return baseModel;
}

/** Non-throwing check: true when any supported AI provider has credentials configured. */
export function isAiProviderConfigured(): boolean {
  return isGeminiConfigured() || isBedrockConfigured() || isOpenAICompatibleConfigured();
}

function getActiveProvider(): AIProvider {
  if (!isAiProviderConfigured()) {
    throw new Error(
      "No AI provider configured. Set GOOGLE_GENERATIVE_AI_API_KEY for Gemini, " +
        "BEDROCK_ENABLED=true with AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION for Anthropic Bedrock, " +
        "or OPENAI_COMPATIBLE_BASE_URL with OPENAI_COMPATIBLE_MODEL for an OpenAI-compatible gateway " +
        "(e.g. OpenRouter, LiteLLM proxy)."
    );
  }

  if (isGeminiConfigured()) return "gemini";
  if (isBedrockConfigured()) return "bedrock";
  return "openai-compatible";
}

export function getLanguageModel(tier: ModelTier = "default"): LanguageModel {
  const provider = getActiveProvider();

  if (provider === "gemini") {
    const google = createGoogleGenerativeAI();
    return google(GEMINI_MODELS[tier]);
  }

  if (provider === "bedrock") {
    const bedrock = createAmazonBedrock();
    return bedrock(BEDROCK_MODELS[tier]);
  }

  const openai = createOpenAI({
    baseURL: process.env.OPENAI_COMPATIBLE_BASE_URL,
    apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
  });
  return openai(getOpenAICompatibleModel(tier));
}
