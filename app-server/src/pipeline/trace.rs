use crate::{
    api::utils::update_project_run_count_exceeded,
    cache::Cache,
    db::{
        self,
        stats::inc_count_for_workspace_using_pipeline_version_id,
        trace::{Span, Trace},
        DB,
    },
    engine::engine::EngineOutput,
    pipeline::RunType,
};

use anyhow::Result;
use backoff::{exponential::ExponentialBackoff, SystemClock};
use chrono::{DateTime, Utc};
use log::error;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::mpsc::Receiver;
use uuid::Uuid;

use super::{
    nodes::{llm, map, subpipeline, zenguard, Message},
    runner::PipelineRunnerError,
};

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

impl RunTrace {
    pub fn from_runner_result(
        run_id: Uuid,
        pipeline_version_id: Uuid,
        run_type: RunType,
        run_output: &Result<EngineOutput, PipelineRunnerError>,
        metadata: HashMap<String, String>,
        parent_span_id: Option<Uuid>,
        trace_id: Option<Uuid>,
    ) -> Option<Self> {
        let success = run_output.is_ok();
        let engine_output = match run_output {
            Ok(engine_output) => Some(engine_output),
            Err(PipelineRunnerError::RunningError(e)) => Some(&e.partial_trace),
            _ => None,
        };

        engine_output.map(|run_output| {
            let run_stats = RunTraceStats::from_messages(&run_output.messages);
            Self {
                run_id,
                pipeline_version_id,
                success,
                run_type,
                run_stats,
                run_output: run_output.clone(),
                metadata,
                parent_span_id,
                trace_id,
            }
        })
    }
}

// This function is more like background message processing, not only logging
// For example, it increases run count
pub async fn log_listener(db: Arc<DB>, cache: Arc<Cache>, mut rx: Receiver<RunTrace>) {
    loop {
        if let Some(trace) = rx.recv().await {
            if let Err(e) = handle_graph_trace(db.clone(), cache.clone(), &trace).await {
                error!("Terminal error handling log: {}", e);
            }
        } else {
            error!("Log sender hung up, killing rx");
            break;
        }
    }
}

pub async fn handle_graph_trace(db: Arc<DB>, cache: Arc<Cache>, trace: &RunTrace) -> Result<()> {
    let pool = &db.pool;
    let pipeline_version_id = trace.pipeline_version_id;

    if trace.run_type.should_write_traces() {
        backoff::future::retry(ExponentialBackoff::<SystemClock>::default(), || async {
            db::trace::write_trace(
                pool,
                &trace.run_id,
                &pipeline_version_id,
                &trace.run_type.to_string(),
                trace.success,
                &serde_json::to_value(trace.run_output.output_message_ids.clone()).unwrap(),
                &trace.run_stats.start_time,
                &trace.run_stats.end_time,
                trace.run_stats.total_token_count,
                trace.run_stats.approximate_cost,
                &serde_json::to_value(trace.metadata.clone()).unwrap(),
            )
            .await
            .map_err(|anyhow_error| {
                log::error!(
                    "Error writing trace to db. May retry according to the backoff policy. Error: {}",
                    anyhow_error
                );
                backoff::Error::Transient {
                    err: anyhow_error,
                    retry_after: None,
                }
            })
        }).await?;

        backoff::future::retry(ExponentialBackoff::<SystemClock>::default(), || async {
            // TODO: Once this is the default option, trace should be constructed with project_id, not pipeline_version_id
            let pipeline = db::pipelines::get_pipeline_by_version_id(pool, &trace.pipeline_version_id).await.map_err(|anyhow_error| {
                log::error!(
                    "Error getting project_id. May retry according to the backoff policy. Error: {}",
                    anyhow_error
                );
                backoff::Error::Transient {
                    err: anyhow_error,
                    retry_after: None,
                }
            })?;
            let project_id = pipeline.project_id;
            // create new trace only if this run is not a part of an existing trace
            if let Some(trace_id) = trace.trace_id {
                db::trace::create_trace_if_none(pool, project_id, trace_id).await.map_err(|anyhow_error| {
                    log::error!(
                        "Error creating trace if none. May retry according to the backoff policy. Error: {}",
                        anyhow_error
                    );
                    backoff::Error::Transient {
                        err: anyhow_error,
                        retry_after: None,
                    }
                })?;
                let attributes = &db::trace::TraceAttributes::from_run_trace(trace_id, trace);
                db::trace::update_trace_attributes(pool, attributes).await.map_err(|anyhow_error| {
                    log::error!(
                        "Error increasing trace attributes. May retry according to the backoff policy. Error: {}",
                        anyhow_error
                    );
                    backoff::Error::Transient {
                        err: anyhow_error,
                        retry_after: None,
                    }
                })
            } else {
                let new_trace = Trace::from_run_trace(trace, project_id);
                db::trace::record_trace(pool, project_id, new_trace.clone()).await.map_err(|anyhow_error| {
                    log::error!(
                        "Error recording trace to db. May retry according to the backoff policy. Error: {}",
                        anyhow_error
                    );
                    backoff::Error::Transient {
                        err: anyhow_error,
                        retry_after: None,
                    }
                })?;
                let attributes = &db::trace::TraceAttributes::from_run_trace(new_trace.id, trace);
                db::trace::update_trace_attributes(pool, attributes).await.map_err(|anyhow_error| {
                    log::error!(
                        "Error increasing trace attributes. May retry according to the backoff policy. Error: {}",
                        anyhow_error
                    );
                    backoff::Error::Transient {
                        err: anyhow_error,
                        retry_after: None,
                    }
                })
            }
        }).await?;

        let messages = &trace.run_output.messages.values().cloned().collect();

        backoff::future::retry(ExponentialBackoff::<SystemClock>::default(), || async {
            db::trace::write_messages(
                pool,
                &trace.run_id,
                &messages,
            )
            .await
            .map_err(|anyhow_error| {
                log::error!(
                    "Error writing messages to db. May retry according to the backoff policy. Error: {}",
                    anyhow_error
                );
                backoff::Error::Transient {
                    err: anyhow_error,
                    retry_after: None,
                }
            })?;

            let trace_id = trace.trace_id.unwrap_or(trace.run_id);
            let spans = if let Some(parent_span_id) = trace.parent_span_id {
                Span::from_messages(
                    &trace.run_output.messages,
                    trace_id,
                    parent_span_id,
                )
            } else {
                // TODO: Once this is the default option, trace should be constructed with pipeline_version_name, not pipeline_version_id
                let pipeline_version = db::pipelines::get_pipeline_version(pool, &trace.pipeline_version_id).await.map_err(|anyhow_error| {
                    log::error!(
                        "Error getting pipeline_version. May retry according to the backoff policy. Error: {}",
                        anyhow_error
                    );
                    backoff::Error::Transient {
                        err: anyhow_error,
                        retry_after: None,
                    }
                })?;
                let parent_span = Span::create_parent_span_in_run_trace(trace.run_id, trace, &pipeline_version.name);
                let mut spans = Span::from_messages(
                    &trace.run_output.messages,
                    trace_id,
                    parent_span.id,
                );
                spans.push(parent_span);
                spans
            };
            
            db::trace::record_spans(pool, spans).await.map_err(|anyhow_error| {
                log::error!(
                    "Error writing spans to db. May retry according to the backoff policy. Error: {}",
                    anyhow_error
                );
                backoff::Error::Transient {
                    err: anyhow_error,
                    retry_after: None,
                }
            })
        }).await?;
    }

    if trace.run_type.should_increment_run_count() {
        backoff::future::retry(ExponentialBackoff::<SystemClock>::default(), || async {
            inc_count_for_workspace_using_pipeline_version_id(pool, &pipeline_version_id)
                .await
                .map_err(|anyhow_error| {
                    log::error!(
                        "Error incrementing run count. May retry according to the backoff policy. Error: {}",
                        anyhow_error
                    );
                    backoff::Error::Transient {
                        err: anyhow_error,
                        retry_after: None,
                    }
                })
        }).await?;
        backoff::future::retry(ExponentialBackoff::<SystemClock>::default(), || async {
            update_project_run_count_exceeded(
                db.clone(),
                cache.clone(),
                &trace.pipeline_version_id
            )
                .await
                .map_err(|anyhow_error| {
                    log::error!(
                        "Error updating run count cache. May retry according to the backoff policy. Error: {}",
                        anyhow_error
                    );
                    backoff::Error::Transient {
                        err: anyhow_error,
                        retry_after: None,
                    }
                })
        }).await?;
    }
    Ok(())
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
