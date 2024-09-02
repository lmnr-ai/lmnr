use crate::{
    api::{utils::update_project_run_count_exceeded, v1::traces::Observation},
    cache::Cache,
    db::{
        self,
        stats::inc_count_for_workspace_using_pipeline_version_id,
        trace::{Span, Trace},
        DB,
    },
    engine::engine::EngineOutput,
    pipeline::RunType,
    traces::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY},
};

use anyhow::Result;
use backoff::{exponential::ExponentialBackoff, SystemClock};
use chrono::{DateTime, Utc};
use lapin::{options::BasicPublishOptions, BasicProperties, Connection};
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

// For now, receives the pipeline trace via in-memory queue, converts to Trace and Span,
// and writes to rabbitmq. In the future, this should be replaced by a direct write to rabbitmq.
pub async fn pipeline_trace_listener(
    db: Arc<DB>,
    cache: Arc<Cache>,
    mut rx: Receiver<RunTrace>,
    rabbitmq_connection: Arc<Connection>,
) {
    loop {
        if let Some(trace) = rx.recv().await {
            if let Err(e) = handle_graph_trace(
                db.clone(),
                cache.clone(),
                &trace,
                rabbitmq_connection.clone(),
            )
            .await
            {
                error!("Terminal error handling log: {}", e);
            }
        } else {
            error!("Log sender hung up, killing rx");
            break;
        }
    }
}

pub async fn handle_graph_trace(
    db: Arc<DB>,
    cache: Arc<Cache>,
    run_trace: &RunTrace,
    rabbitmq_connection: Arc<Connection>,
) -> Result<()> {
    let pool = &db.pool;
    let pipeline_version_id = run_trace.pipeline_version_id;

    if run_trace.run_type.should_write_traces() {
        // TODO: Trace should be constructed with project_id, not pipeline_version_id
        let pipeline =
            db::pipelines::get_pipeline_by_version_id(pool, &run_trace.pipeline_version_id).await?;
        let project_id = pipeline.project_id;

        let channel = rabbitmq_connection.create_channel().await?;

        // create new trace only if this run is not a part of an existing trace
        let trace_id = if let Some(existing_trace_id) = run_trace.trace_id {
            existing_trace_id
        } else {
            // only needed to upate what `update_trace_attributes` does not, i.e. metadata
            let trace = Trace::from_run_trace(run_trace, project_id);
            let payload = serde_json::to_string(&Observation::Trace(trace)).unwrap();
            let payload = payload.as_bytes();
            channel
                .basic_publish(
                    OBSERVATIONS_EXCHANGE,
                    OBSERVATIONS_ROUTING_KEY,
                    BasicPublishOptions::default(),
                    payload,
                    BasicProperties::default(),
                )
                .await
                .expect("Failed to publish pipeline trace")
                .await
                .expect("Failed to ack on publish pipeline trace");
            run_trace.run_id
        };

        let attributes = &db::trace::TraceAttributes::from_run_trace(trace_id, run_trace);
        db::trace::update_trace_attributes(pool, &project_id, attributes).await?;

        let spans = if let Some(parent_span_id) = run_trace.parent_span_id {
            Span::from_messages(&run_trace.run_output.messages, trace_id, parent_span_id)
        } else {
            // TODO: Trace should be constructed with pipeline_version_name, not pipeline_version_id
            let pipeline_version =
                db::pipelines::get_pipeline_version(pool, &run_trace.pipeline_version_id).await?;
            let parent_span = Span::create_parent_span_in_run_trace(
                run_trace.run_id,
                run_trace,
                &pipeline_version.name,
            );
            let mut spans =
                Span::from_messages(&run_trace.run_output.messages, trace_id, parent_span.id);
            spans.push(parent_span);
            spans
        };

        for span in spans {
            let payload = serde_json::to_string(&Observation::Span(
                span.to_span_with_empty_checks_and_events(&project_id),
            ))
            .unwrap();
            let payload = payload.as_bytes();
            channel
                .basic_publish(
                    OBSERVATIONS_EXCHANGE,
                    OBSERVATIONS_ROUTING_KEY,
                    BasicPublishOptions::default(),
                    payload,
                    BasicProperties::default(),
                )
                .await
                .expect("Failed to publish pipeline trace")
                .await
                .expect("Failed to ack on publish pipeline trace");
        }
    }

    if run_trace.run_type.should_increment_run_count() {
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
                &run_trace.pipeline_version_id
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
