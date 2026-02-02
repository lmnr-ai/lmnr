use std::{
    env,
    sync::{Arc, LazyLock},
    time::{Duration, Instant},
};

use async_trait::async_trait;
use chrono::Utc;
use uuid::Uuid;

use crate::batch_worker::message_handler::{BatchMessageHandler, HandlerResult};
use crate::batch_worker::{config::BatchingConfig, message_handler::MessageDelivery};
use crate::ch::signal_runs::insert_signal_runs;
use crate::db::DB;
use crate::db::signals::Signal;
use crate::mq::MessageQueue;
use crate::routes::signals::SubmitSignalJobResponse;
use crate::signals::push_to_signals_queue;
use crate::signals::queue::{
    SignalJobSubmissionBatchMessage, SignalMessage, push_to_submissions_queue,
};
use crate::signals::utils::{InternalSpan, emit_internal_span};
use crate::worker::HandlerError;

static LLM_MODEL: LazyLock<String> =
    LazyLock::new(|| env::var("SIGNAL_JOB_LLM_MODEL").unwrap_or("gemini-2.5-flash".to_string()));
static LLM_PROVIDER: LazyLock<String> =
    LazyLock::new(|| env::var("SIGNAL_JOB_LLM_PROVIDER").unwrap_or("gemini".to_string()));

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
                model: LLM_MODEL.clone(),
                provider: LLM_PROVIDER.clone(),
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
            run_metadata: super::queue::SignalRunMetadata {
                run_id,
                internal_trace_id,
                internal_span_id,
                job_id: job.id,
                step: 0,
            },
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
    /// All messages in this batch (may contain different projects/signals)
    messages: Vec<MessageDelivery<SignalMessage>>,
    last_flush: Instant,
}

impl SignalBatch {
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
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
    ) -> Result<
        Vec<MessageDelivery<SignalMessage>>,
        (Vec<MessageDelivery<SignalMessage>>, HandlerError),
    > {
        let deliveries = batch.messages;

        if deliveries.is_empty() {
            return Ok(deliveries);
        }

        match push_to_submissions_queue(
            SignalJobSubmissionBatchMessage {
                messages: deliveries.iter().map(|d| d.message.clone()).collect(),
            },
            self.queue.clone(),
        )
        .await
        {
            Ok(()) => Ok(deliveries),
            Err(e) => {
                log::warn!("Failed to push batch to submissions queue: {:?}", e);
                Err((deliveries, HandlerError::transient(e)))
            }
        }
    }
}

#[async_trait]
impl BatchMessageHandler for SignalBatchingHandler {
    type Message = SignalMessage;
    type State = SignalBatch;

    /// Interval is half of the flush interval to ensure batches are checked frequently enough.
    fn interval(&self) -> Duration {
        self.config.flush_interval / 2
    }

    fn initial_state(&self) -> Self::State {
        SignalBatch::new()
    }

    async fn handle_message(
        &self,
        delivery: MessageDelivery<Self::Message>,
        state: &mut Self::State,
    ) -> HandlerResult<Self::Message> {
        // Add message to the single batch
        state.messages.push(delivery.clone());

        let batch_len = state.messages.len();

        // Flush if batch size reached
        if batch_len >= self.config.size {
            // Take the batch and replace with new one
            let batch = std::mem::replace(state, SignalBatch::new());
            return match self.flush_batch(batch).await {
                Ok(deliveries) => HandlerResult::ack(deliveries),
                Err((deliveries, error)) => {
                    if error.should_requeue() {
                        HandlerResult::requeue(deliveries)
                    } else {
                        HandlerResult::reject(deliveries)
                    }
                }
            };
        }

        HandlerResult::empty()
    }

    async fn handle_interval(&self, state: &mut Self::State) -> HandlerResult<Self::Message> {
        let now = Instant::now();

        // Check if batch is stale and non-empty
        if !state.messages.is_empty()
            && now.duration_since(state.last_flush) >= self.config.flush_interval
        {
            // Take the batch and replace with new one
            let batch = std::mem::replace(state, SignalBatch::new());
            return match self.flush_batch(batch).await {
                Ok(deliveries) => HandlerResult::ack(deliveries),
                Err((deliveries, error)) => {
                    if error.should_requeue() {
                        HandlerResult::requeue(deliveries)
                    } else {
                        HandlerResult::reject(deliveries)
                    }
                }
            };
        }

        HandlerResult::empty()
    }
}
