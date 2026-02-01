use std::{
    collections::HashMap,
    env,
    sync::Arc,
    time::{Duration, Instant},
};

use async_trait::async_trait;
use chrono::Utc;
use uuid::Uuid;

use crate::batch_worker::config::BatchingConfig;
use crate::batch_worker::message_handler::{BatchMessageHandler, HandlerResult};
use crate::ch::signal_runs::insert_signal_runs;
use crate::db::DB;
use crate::db::signals::Signal;
use crate::mq::MessageQueue;
use crate::routes::signals::SubmitSignalJobResponse;
use crate::signals::push_to_signals_queue;
use crate::signals::queue::{
    SignalJobSubmissionBatchMessage, SignalMessage, SignalRunMetadata, SignalRunPayload,
    push_to_submissions_queue,
};
use crate::signals::utils::{InternalSpan, emit_internal_span};
use crate::worker::HandlerError;

/// Flatten the job runs and push it to the queue, so that only BatchMessageHandler
/// is responsible for batching
pub async fn enqueue_signal_job(
    project_id: Uuid,
    signal: Signal,
    db: Arc<DB>,
    trace_ids: Vec<Uuid>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<SubmitSignalJobResponse> {
    // get internal project id for tracing
    let internal_project_id: Option<Uuid> = env::var("SIGNAL_JOB_INTERNAL_PROJECT_ID")
        .ok()
        .and_then(|s| s.parse().ok());

    let llm_model = env::var("SIGNAL_JOB_LLM_MODEL").unwrap_or("gemini-2.5-flash".to_string());
    let llm_provider = env::var("SIGNAL_JOB_LLM_PROVIDER").unwrap_or("gemini".to_string());

    let total_traces: i32 = trace_ids.len() as i32;

    let job =
        crate::db::signal_jobs::create_signal_job(&db.pool, signal.id, project_id, total_traces)
            .await
            .map_err(|e| {
                log::error!("Failed to create signal job: {:?}", e);
                anyhow::anyhow!("Failed to create signal job")
            })?;

    let mut signal_runs: Vec<super::SignalRun> = Vec::with_capacity(trace_ids.len());
    for trace_id in trace_ids {
        let run_id = Uuid::new_v4();
        let internal_trace_id = Uuid::new_v4();

        // Emit root span for internal tracing of a run
        let internal_span_id = emit_internal_span(
            queue.clone(),
            InternalSpan {
                name: "signal.run".to_string(),
                trace_id: internal_trace_id,
                run_id,
                signal_name: signal.name.clone(),
                parent_span_id: None,
                span_type: crate::db::spans::SpanType::Default,
                start_time: chrono::Utc::now(),
                input: Some(serde_json::json!({
                    "run_id": run_id,
                    "trace_id": trace_id,
                    "signal_id": signal.id,
                    "job_id": job.id,
                })),
                output: None,
                input_tokens: None,
                output_tokens: None,
                model: llm_model.clone(),
                provider: llm_provider.clone(),
                internal_project_id,
                job_ids: vec![job.id],
            },
        )
        .await;

        let mut signal_run = super::SignalRun {
            run_id,
            project_id,
            job_id: job.id,
            trigger_id: Uuid::nil(),
            signal_id: signal.id,
            trace_id,
            step: 0,
            status: super::RunStatus::Pending,
            internal_trace_id,
            internal_span_id,
            updated_at: Utc::now(),
            event_id: None,
            error_message: None,
        };

        let message = SignalMessage {
            trace_id,
            project_id,
            trigger_id: None,
            signal: signal.clone(),
            run_metadata: Some(SignalRunMetadata {
                run_id,
                internal_trace_id,
                internal_span_id,
                job_id: job.id,
            }),
        };

        if push_to_signals_queue(message, queue.clone()).await.is_err() {
            signal_run = signal_run.failed("Failed to push to signals queue");
        }

        signal_runs.push(signal_run);
    }

    let ch_runs: Vec<crate::ch::signal_runs::CHSignalRun> = signal_runs
        .iter()
        .map(crate::ch::signal_runs::CHSignalRun::from)
        .collect();

    insert_signal_runs(clickhouse.clone(), &ch_runs)
        .await
        .map_err(|e| {
            log::error!("Failed to insert signal runs: {:?}", e);
            anyhow::anyhow!("Failed to insert signal runs")
        })?;

    let response = SubmitSignalJobResponse {
        job_id: job.id,
        total_traces: job.total_traces,
        signal_id: job.signal_id,
    };

    Ok(response)
}

#[derive(Clone)]
pub struct SignalBatch {
    message: SignalMessage,
    runs: Vec<SignalRunPayload>,
    last_flush: Instant,
}

impl SignalBatch {
    pub fn from_message(message: SignalMessage) -> Self {
        Self {
            message,
            runs: Vec::new(),
            last_flush: Instant::now(),
        }
    }
}

pub struct SignalBatchingHandler {
    queue: Arc<MessageQueue>,
    config: BatchingConfig,
}

impl SignalBatchingHandler {
    pub fn new(queue: Arc<MessageQueue>, config: BatchingConfig) -> Self {
        Self { queue, config }
    }

    /// Process signal identification
    async fn flush_batch(
        &self,
        batch: SignalBatch,
    ) -> Result<Vec<SignalMessage>, (Vec<SignalMessage>, HandlerError)> {
        let llm_model = env::var("SIGNAL_JOB_LLM_MODEL").unwrap_or("gemini-2.5-flash".to_string());
        let llm_provider = env::var("SIGNAL_JOB_LLM_PROVIDER").unwrap_or("gemini".to_string());
        let message = batch.message;
        let runs = batch.runs;
        // Generate a tracking ID for the batch message (used only for logging/display)
        // Individual runs track their own job_ids for stats updates
        let tracking_id = Uuid::new_v4();

        match push_to_submissions_queue(
            SignalJobSubmissionBatchMessage {
                project_id: message.project_id,
                tracking_id,
                signal_id: message.signal.id,
                signal_name: message.signal.name.clone(),
                prompt: message.signal.prompt.clone(),
                structured_output_schema: message.signal.structured_output_schema.clone(),
                model: llm_model,
                provider: llm_provider,
                runs,
            },
            self.queue.clone(),
        )
        .await
        {
            Ok(()) => Ok(vec![message]),
            Err(e) => Err((vec![message], HandlerError::transient(e))),
        }
    }
}

#[async_trait]
impl BatchMessageHandler for SignalBatchingHandler {
    type Message = SignalMessage;
    // project_id, signal_id to a batch of signal messages
    type State = HashMap<(Uuid, Uuid), SignalBatch>;

    /// Interval is half of the flush interval to ensure batches are checked frequently enough.
    fn interval(&self) -> Duration {
        self.config.flush_interval / 2
    }

    fn initial_state(&self) -> Self::State {
        HashMap::new()
    }

    async fn handle_message(
        &self,
        message: Self::Message,
        state: &mut Self::State,
    ) -> HandlerResult<Self::Message> {
        let key = (message.project_id, message.signal.id);
        let trace_id = message.trace_id;

        // Use provided run_metadata (from batch API) or create new run info (for triggered runs)
        let run_payload = match message.run_metadata {
            Some(ref metadata) => SignalRunPayload {
                run_id: metadata.run_id,
                trace_id,
                step: 0,
                internal_trace_id: metadata.internal_trace_id,
                internal_span_id: metadata.internal_span_id,
                job_id: metadata.job_id,
            },
            None => SignalRunPayload {
                run_id: Uuid::new_v4(),
                trace_id,
                step: 0,
                internal_trace_id: Uuid::nil(),
                internal_span_id: Uuid::nil(),
                job_id: Uuid::nil(),
            },
        };

        // Add message to batch
        state
            .entry(key)
            .or_insert_with(|| SignalBatch::from_message(message))
            .runs
            .push(run_payload);

        let batch_len = state.get(&key).map(|b| b.runs.len()).unwrap_or(0);
        log::debug!("Batch key={:?}, len={}", key, batch_len);

        // Flush if batch size reached
        if batch_len >= self.config.size {
            if let Some(batch) = state.remove(&key) {
                return match self.flush_batch(batch).await {
                    Ok(messages) => HandlerResult::ack(messages),
                    Err((messages, error)) => {
                        if error.should_requeue() {
                            HandlerResult::requeue(messages)
                        } else {
                            HandlerResult::reject(messages)
                        }
                    }
                };
            }
        }

        HandlerResult::empty()
    }

    async fn handle_interval(&self, state: &mut Self::State) -> HandlerResult<Self::Message> {
        let now = Instant::now();
        let mut to_ack = Vec::new();
        let mut to_reject = Vec::new();
        let mut to_requeue = Vec::new();

        // Find all stale batches
        let stale_keys: Vec<_> = state
            .iter()
            .filter(|(_, batch)| {
                !batch.runs.is_empty()
                    && now.duration_since(batch.last_flush) >= self.config.flush_interval
            })
            .map(|(key, _)| *key)
            .collect();

        // Flush all stale batches
        for key in stale_keys {
            if let Some(batch) = state.remove(&key) {
                log::debug!(
                    "Flushing stale batch: {} messages, age={:?}",
                    batch.runs.len(),
                    now.duration_since(batch.last_flush)
                );
                match self.flush_batch(batch).await {
                    Ok(messages) => to_ack.extend(messages),
                    Err((messages, error)) => {
                        if error.should_requeue() {
                            to_requeue.extend(messages);
                        } else {
                            to_reject.extend(messages);
                        }
                    }
                }
            }
        }

        HandlerResult {
            to_ack,
            to_reject,
            to_requeue,
        }
    }
}
