use chrono::{DateTime, Utc};
use serde::Serialize;
use std::{env, fmt, sync::LazyLock};
use uuid::Uuid;

pub mod batching;
pub mod enqueue;
pub mod gemini;
pub mod pendings_consumer;
pub mod postprocess;
pub mod prompts;
pub mod queue;
pub mod spans;
pub mod submissions_consumer;
pub mod tools;
pub mod utils;

pub use queue::push_to_signals_queue;

pub use queue::{
    SIGNAL_JOB_PENDING_BATCH_EXCHANGE, SIGNAL_JOB_PENDING_BATCH_QUEUE,
    SIGNAL_JOB_PENDING_BATCH_ROUTING_KEY, SIGNAL_JOB_SUBMISSION_BATCH_EXCHANGE,
    SIGNAL_JOB_SUBMISSION_BATCH_QUEUE, SIGNAL_JOB_SUBMISSION_BATCH_ROUTING_KEY,
    SIGNAL_JOB_WAITING_BATCH_EXCHANGE, SIGNAL_JOB_WAITING_BATCH_QUEUE,
    SIGNAL_JOB_WAITING_BATCH_ROUTING_KEY, SIGNALS_EXCHANGE, SIGNALS_QUEUE, SIGNALS_ROUTING_KEY,
};

use crate::signals::queue::SignalMessage;

pub static LLM_MODEL: LazyLock<String> =
    LazyLock::new(|| env::var("SIGNAL_JOB_LLM_MODEL").unwrap_or("gemini-2.5-flash".to_string()));
pub static LLM_PROVIDER: LazyLock<String> =
    LazyLock::new(|| env::var("SIGNAL_JOB_LLM_PROVIDER").unwrap_or("gemini".to_string()));

/// Configuration for signal workers, initialized from environment variables.
#[derive(Debug, Clone)]
pub struct SignalWorkerConfig {
    /// Maximum number of LLM tool-calling steps allowed per run
    pub max_allowed_steps: usize,
    /// Project ID for internal tracing (None = internal tracing disabled)
    pub internal_project_id: Option<Uuid>,
    /// TTL for waiting queue (in milliseconds)
    pub waiting_queue_ttl_ms: u64,
}

impl SignalWorkerConfig {
    /// Creates a new SignalWorkerConfig from environment variables.
    ///
    /// Environment variables:
    /// - `SIGNAL_JOB_MAX_ALLOWED_STEPS`: Maximum steps per run (default: 5)
    /// - `SIGNAL_JOB_INTERNAL_PROJECT_ID`: Project ID for internal tracing (optional)
    /// - `SIGNAL_JOB_WAITING_QUEUE_TTL_MS`: TTL for waiting queue in milliseconds (default: 300000)
    pub fn from_env() -> Self {
        let max_allowed_steps = env::var("SIGNAL_JOB_MAX_ALLOWED_STEPS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(5);

        let internal_project_id = env::var("SIGNAL_JOB_INTERNAL_PROJECT_ID")
            .ok()
            .and_then(|s| s.parse().ok());

        let waiting_queue_ttl_ms = env::var("SIGNAL_JOB_WAITING_QUEUE_TTL_MS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(300_000);

        Self {
            max_allowed_steps,
            internal_project_id,
            waiting_queue_ttl_ms,
        }
    }
}

/// Represents a signal run with its current state and metadata.
/// Used to track individual runs.
#[derive(Debug, Clone, Serialize)]
pub struct SignalRun {
    pub run_id: Uuid,
    pub project_id: Uuid,
    pub job_id: Option<Uuid>,
    pub trigger_id: Option<Uuid>,
    pub signal_id: Uuid,
    pub trace_id: Uuid,
    pub step: usize,
    pub status: RunStatus,
    pub internal_trace_id: Uuid,
    pub internal_span_id: Uuid,
    pub updated_at: DateTime<Utc>,
    pub event_id: Option<Uuid>,
    pub error_message: Option<String>,
}

impl SignalRun {
    pub fn failed(mut self, error: impl Into<String>) -> Self {
        self.status = RunStatus::Failed;
        self.error_message = Some(error.into());
        self
    }

    pub fn completed(mut self) -> Self {
        self.status = RunStatus::Completed;
        self
    }

    pub fn completed_with_event(mut self, event_id: Uuid) -> Self {
        self.status = RunStatus::Completed;
        self.event_id = Some(event_id);
        self
    }

    pub fn next_step(mut self) -> Self {
        self.step += 1;
        self
    }

    pub fn from_message(message: &SignalMessage, signal_id: Uuid) -> Self {
        Self {
            run_id: message.run_id,
            project_id: message.project_id,
            job_id: message.job_id,
            trigger_id: message.trigger_id,
            signal_id,
            trace_id: message.trace_id,
            step: message.step,
            status: RunStatus::Pending,
            internal_trace_id: message.internal_trace_id,
            internal_span_id: message.internal_span_id,
            updated_at: chrono::Utc::now(),
            event_id: None,
            error_message: None,
        }
    }

    pub fn nil_with_id(id: Uuid, trace_id: Uuid) -> Self {
        Self {
            run_id: id,
            project_id: Uuid::nil(),
            job_id: None,
            trigger_id: None,
            signal_id: Uuid::nil(),
            trace_id,
            step: 0,
            status: RunStatus::Pending,
            internal_trace_id: Uuid::nil(),
            internal_span_id: Uuid::nil(),
            updated_at: chrono::Utc::now(),
            event_id: None,
            error_message: None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[repr(u8)]
pub enum RunStatus {
    Pending = 0,
    Completed = 1,
    Failed = 2,
}

impl RunStatus {
    pub fn as_u8(&self) -> u8 {
        *self as u8
    }
}

impl fmt::Display for RunStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RunStatus::Completed => write!(f, "COMPLETED"),
            RunStatus::Failed => write!(f, "FAILED"),
            RunStatus::Pending => write!(f, "PENDING"),
        }
    }
}
