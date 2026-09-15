import type { ModelTier } from "./model";

/**
 * LLM features the frontend runs itself. The value is the `feature_id` they
 * resolve through `llm_feature_routes`. The id namespace is shared with
 * `app-server/src/llm/features.rs` (`LlmFeature::as_str`) — a feature must
 * spell its id identically on both sides, and never collide with one the
 * app-server owns.
 */
export enum LlmFeature {
  EVALUATION_SCORE_DIRECTIONS = "evaluation_score_directions",
  RENDER_TEMPLATE_GENERATION = "render_template_generation",
  SESSION_PROMPT_EXTRACTION = "session_prompt_extraction",
  SPAN_PREVIEW_AGENT_NAMES = "span_preview_agent_names",
  SPAN_PREVIEW_PROMPTS = "span_preview_prompts",
  SQL_GENERATION = "sql_generation",
}

/** Env-provider tier used when no route applies to the feature. */
export const LLM_FEATURE_ENV_TIER: Record<LlmFeature, ModelTier> = {
  [LlmFeature.EVALUATION_SCORE_DIRECTIONS]: "small",
  [LlmFeature.RENDER_TEMPLATE_GENERATION]: "medium",
  [LlmFeature.SESSION_PROMPT_EXTRACTION]: "small",
  [LlmFeature.SPAN_PREVIEW_AGENT_NAMES]: "small",
  [LlmFeature.SPAN_PREVIEW_PROMPTS]: "small",
  [LlmFeature.SQL_GENERATION]: "medium",
};

/** Last table-level fallback: a route for this id applies to every feature without its own row. */
export const DEFAULT_LLM_FEATURE_ID = "default";
