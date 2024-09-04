use crate::{engine::engine::EngineOutput, pipeline::RunType};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use super::nodes::{llm, map, subpipeline, zenguard, Message};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunTraceStats {
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub total_token_count: i64,
    pub approximate_cost: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
#[serde(rename_all = "camelCase")]
pub enum MetaLog {
    LLM(llm::LLMNodeMetaLog),
    Zenguard(zenguard::ZenguardNodeMetaLog),
    Subpipeline(subpipeline::SubpipelineNodeMetaLog),
    Map(map::MapNodeMetaLog),
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunTrace {
    pub run_id: Uuid,
    pub pipeline_version_id: Uuid,
    pub success: bool,
    pub run_type: RunType,
    #[serde(flatten)]
    pub run_stats: RunTraceStats,
    #[serde(flatten)]
    pub run_output: EngineOutput,
    /// any optional metadata sent by the user
    pub metadata: HashMap<String, String>,
    pub parent_span_id: Option<Uuid>,
    pub trace_id: Option<Uuid>,
}

impl RunTraceStats {
    pub fn from_messages(messages: &HashMap<Uuid, Message>) -> Self {
        let mut earliest_start_time = Utc::now();
        let mut latest_end_time = DateTime::<Utc>::default(); // UNIX_EPOCH
        let mut total_token_count = 0;
        let mut approximate_cost = Some(0.0);

        messages.values().into_iter().for_each(|message| {
            if message.start_time < earliest_start_time {
                earliest_start_time = message.start_time;
            }
            if message.end_time > latest_end_time {
                latest_end_time = message.end_time;
            }
            total_token_count += match &message.meta_log {
                Some(MetaLog::LLM(llm_meta)) => llm_meta.total_token_count,
                Some(MetaLog::Zenguard(_)) => 0,
                Some(MetaLog::Subpipeline(subpipeline_meta)) => subpipeline_meta.total_token_count,
                Some(MetaLog::Map(map_meta)) => map_meta.total_token_count,
                None => 0,
            };

            let message_cost = match &message.meta_log {
                Some(MetaLog::LLM(llm_meta)) => llm_meta.approximate_cost,
                // TODO: Update Zenguard cost when they become paid, but they are indeed free now
                // I should've put None, but we care more about LLM prices, so not to make whole `approximate_cost` None because of Zenguard
                Some(MetaLog::Zenguard(_)) => Some(0.0),
                Some(MetaLog::Subpipeline(subpipeline_meta)) => subpipeline_meta.approximate_cost,
                Some(MetaLog::Map(map_meta)) => map_meta.approximate_cost,
                None => Some(0.0),
            };
            if let Some(cost) = approximate_cost {
                // add up at least the costs we can
                if let Some(message_cost) = message_cost {
                    approximate_cost = Some(cost + message_cost)
                } else {
                    approximate_cost = None;
                }
            }
        });

        Self {
            start_time: earliest_start_time,
            end_time: latest_end_time,
            total_token_count,
            approximate_cost,
        }
    }
}
