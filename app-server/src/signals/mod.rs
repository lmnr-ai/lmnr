use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{env, fmt, sync::OnceLock};
use uuid::Uuid;

pub mod batching;
pub mod common;
pub mod enqueue;
pub mod filter;
pub mod pendings_consumer;
pub mod postprocess;
pub mod prompts;
pub mod provider;
pub mod queue;
pub mod realtime_api;
pub mod response_processor;
pub mod search;
pub mod spans;
pub mod submissions_consumer;
pub mod summarize;
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

static LLM_MODEL: OnceLock<String> = OnceLock::new();
static LLM_PROVIDER: OnceLock<String> = OnceLock::new();

/// Get the LLM model name.
pub fn llm_model() -> String {
    LLM_MODEL
        .get_or_init(|| {
            env::var("SIGNALS_LLM_MODEL")
                .ok()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| provider::default_model_for_provider(&llm_provider()))
        })
        .clone()
}

/// Get the LLM provider name.
pub fn llm_provider() -> String {
    LLM_PROVIDER
        .get_or_init(|| provider::resolve_provider_name())
        .clone()
}

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

/// Signal processing mode: batch (cheaper, slower) or realtime (2x cost, faster).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[repr(u8)]
pub enum SignalMode {
    Batch = 0,
    Realtime = 1,
}

impl SignalMode {
    pub fn as_u8(self) -> u8 {
        self as u8
    }

    pub fn from_u8(value: u8) -> Self {
        match value {
            1 => Self::Realtime,
            _ => Self::Batch,
        }
    }

    pub fn is_realtime(self) -> bool {
        self == Self::Realtime
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
    pub mode: SignalMode,
    pub steps_processed: u32,
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
            mode: SignalMode::from_u8(message.mode),
            steps_processed: message.steps_processed,
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
            mode: SignalMode::Batch,
            steps_processed: 0,
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
