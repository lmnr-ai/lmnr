//! LLM-backed features and how a request picks its model.
//!
//! Every LLM call in the app-server belongs to one [`LlmFeature`]. The feature id
//! is the string key of `llm_feature_routes`; the frontend keeps its own list of
//! ids for the features it runs (`frontend/lib/ai/features.ts`) in the same
//! namespace. Features that used to differ only by model size are separate ids,
//! so a route can pick a different profile/model for each.

use std::fmt;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{models::ModelSize, profiles::LlmProfileRoute};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LlmFeature {
    /// Table-level fallback: consulted when a feature has no row of its own.
    Default,
    Signals,
    SignalsPromptSummarization,
    SignalsKeepRules,
    InputExtractionDirect,
    InputExtractionRegexGeneration,
    InputExtractionRegexGenerationMulti,
    StaticPromptExtraction,
    AgentChat,
    AgentAutoname,
    ClusteringNaming,
    CheckpointsClassifier,
    CheckpointsSystemPrompt,
    Reports,
}

impl LlmFeature {
    /// The `feature_id` column value.
    pub fn as_str(self) -> &'static str {
        match self {
            LlmFeature::Default => "default",
            LlmFeature::Signals => "signals",
            LlmFeature::SignalsPromptSummarization => "signals_prompt_summarization",
            LlmFeature::SignalsKeepRules => "signals_keep_rules",
            LlmFeature::InputExtractionDirect => "input_extraction_direct",
            LlmFeature::InputExtractionRegexGeneration => "input_extraction_regex_generation",
            LlmFeature::InputExtractionRegexGenerationMulti => {
                "input_extraction_regex_generation_multi"
            }
            LlmFeature::StaticPromptExtraction => "static_prompt_extraction",
            LlmFeature::AgentChat => "agent_chat",
            LlmFeature::AgentAutoname => "agent_autoname",
            LlmFeature::ClusteringNaming => "clustering_naming",
            LlmFeature::CheckpointsClassifier => "checkpoints_classifier",
            LlmFeature::CheckpointsSystemPrompt => "checkpoints_system_prompt",
            LlmFeature::Reports => "reports",
        }
    }

    /// Model size used when no route exists and the call falls back to `LLM_PROVIDER`.
    pub fn env_size(self) -> ModelSize {
        match self {
            LlmFeature::InputExtractionDirect
            | LlmFeature::InputExtractionRegexGeneration
            | LlmFeature::AgentAutoname
            | LlmFeature::ClusteringNaming
            | LlmFeature::CheckpointsClassifier
            | LlmFeature::CheckpointsSystemPrompt => ModelSize::Small,
            LlmFeature::Default
            | LlmFeature::Signals
            | LlmFeature::SignalsPromptSummarization
            | LlmFeature::SignalsKeepRules
            | LlmFeature::InputExtractionRegexGenerationMulti
            | LlmFeature::StaticPromptExtraction
            | LlmFeature::AgentChat
            | LlmFeature::Reports => ModelSize::Medium,
        }
    }
}

impl fmt::Display for LlmFeature {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// How one `ProviderRequest` picks its provider client and model.
///
/// `Profile` is an explicit pin (a signal or playground chose a workspace LLM
/// profile + model). `Feature` resolves through `llm_feature_routes`:
/// the project's workspace row, then the global row, each for the feature and
/// then for `default`; with no row at all the call uses `LLM_PROVIDER` with the
/// feature's [`LlmFeature::env_size`] model.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LlmRoute {
    Profile(LlmProfileRoute),
    Feature {
        feature: LlmFeature,
        /// Scopes the workspace lookup; `None` consults only global rows.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        project_id: Option<Uuid>,
    },
}

impl LlmRoute {
    pub fn feature(feature: LlmFeature, project_id: Option<Uuid>) -> Self {
        LlmRoute::Feature {
            feature,
            project_id,
        }
    }
}

impl Default for LlmRoute {
    fn default() -> Self {
        LlmRoute::feature(LlmFeature::Default, None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL: [LlmFeature; 14] = [
        LlmFeature::Default,
        LlmFeature::Signals,
        LlmFeature::SignalsPromptSummarization,
        LlmFeature::SignalsKeepRules,
        LlmFeature::InputExtractionDirect,
        LlmFeature::InputExtractionRegexGeneration,
        LlmFeature::InputExtractionRegexGenerationMulti,
        LlmFeature::StaticPromptExtraction,
        LlmFeature::AgentChat,
        LlmFeature::AgentAutoname,
        LlmFeature::ClusteringNaming,
        LlmFeature::CheckpointsClassifier,
        LlmFeature::CheckpointsSystemPrompt,
        LlmFeature::Reports,
    ];

    /// The DB key (`as_str`) and the wire form (serde) must be the same string.
    #[test]
    fn feature_ids_match_serde_and_are_unique() {
        let mut seen = std::collections::HashSet::new();
        for feature in ALL {
            assert!(seen.insert(feature.as_str()), "duplicate id {feature}");
            let json = serde_json::to_value(feature).unwrap();
            assert_eq!(
                json,
                serde_json::Value::String(feature.as_str().to_string())
            );
        }
    }

    #[test]
    fn route_serializes_with_kind_tag() {
        let route = LlmRoute::feature(LlmFeature::Signals, None);
        let json = serde_json::to_value(&route).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "kind": "feature", "feature": "signals" })
        );
        assert_eq!(serde_json::from_value::<LlmRoute>(json).unwrap(), route);
    }
}
