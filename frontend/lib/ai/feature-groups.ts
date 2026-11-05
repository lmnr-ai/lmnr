import { Feature } from "@/lib/features/features";

import { DEFAULT_LLM_FEATURE_ID, LlmFeature } from "./features";

/**
 * How settings present `llm_feature_routes`: one row per group, and saving a
 * group writes (or clears) one workspace row per feature id. The backend only
 * knows ids; groups exist only here. Ids the frontend does not run are spelled
 * as the app-server's `LlmFeature::as_str` values.
 *
 * Signals are not a group: every signal pins its own profile and model.
 */
export type LlmFeatureGroup = {
  id: string;
  label: string;
  description: string;
  featureIds: string[];
  /** Shown only when this flag is on. */
  requires?: Feature;
};

export const DEFAULT_FEATURE_GROUP_ID = "default";

export const LLM_FEATURE_GROUPS: LlmFeatureGroup[] = [
  {
    id: DEFAULT_FEATURE_GROUP_ID,
    label: "Default",
    description: "Used by every feature below that is unset.",
    featureIds: [DEFAULT_LLM_FEATURE_ID],
  },
  {
    id: "trace_previews",
    label: "Trace previews",
    description: "One-line span previews and agent names in the trace view.",
    featureIds: [LlmFeature.SPAN_PREVIEW_PROMPTS, LlmFeature.SPAN_PREVIEW_AGENT_NAMES],
  },
  {
    id: "input_extraction",
    label: "Input extraction",
    description: "Extracts user tasks and system prompts from traces during ingestion.",
    featureIds: [
      "input_extraction_direct",
      "input_extraction_regex_generation",
      "input_extraction_regex_generation_multi",
      "static_prompt_extraction",
      LlmFeature.SESSION_PROMPT_EXTRACTION,
    ],
  },
  {
    id: "naming",
    label: "Naming",
    description: "Short labels: cluster names, agent and chat titles, eval score directions.",
    featureIds: [
      "clustering_naming",
      "agent_autoname",
      "checkpoints_agent_naming",
      LlmFeature.EVALUATION_SCORE_DIRECTIONS,
    ],
  },
  {
    id: "sql_templates",
    label: "SQL & templates",
    description: "Ask AI in the SQL editor and render template generation.",
    featureIds: [LlmFeature.SQL_GENERATION, LlmFeature.RENDER_TEMPLATE_GENERATION],
  },
  {
    id: "agent_chat",
    label: "Agent chat",
    description: "The Laminar agent in the app, Slack and CLI.",
    featureIds: ["agent_chat"],
    requires: Feature.AGENT,
  },
  {
    id: "reports",
    label: "Reports",
    description: "Scheduled signal reports.",
    featureIds: ["reports"],
    requires: Feature.SIGNALS,
  },
];

/** Groups whose feature ids include any of `featureIds`, for naming what uses a profile. */
export const featureGroupLabels = (featureIds: string[]): string[] =>
  LLM_FEATURE_GROUPS.filter((g) => g.featureIds.some((id) => featureIds.includes(id))).map((g) => g.label);
