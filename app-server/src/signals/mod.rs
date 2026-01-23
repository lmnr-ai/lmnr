use chrono::{DateTime, Utc};
use serde::Serialize;
use std::fmt;
use uuid::Uuid;

pub mod filters;
pub mod gemini;
pub mod pendings_consumer;
pub mod prompts;
pub mod queue;
pub mod spans;
pub mod submissions_consumer;
pub mod tools;
pub mod utils;

pub(crate) use queue::push_to_waiting_queue;
pub use filters::{Filter, evaluate_filters};
pub use queue::{
    SIGNAL_JOB_PENDING_BATCH_EXCHANGE, SIGNAL_JOB_PENDING_BATCH_QUEUE,
    SIGNAL_JOB_PENDING_BATCH_ROUTING_KEY, SIGNAL_JOB_SUBMISSION_BATCH_EXCHANGE,
    SIGNAL_JOB_SUBMISSION_BATCH_QUEUE, SIGNAL_JOB_SUBMISSION_BATCH_ROUTING_KEY,
    SIGNAL_JOB_WAITING_BATCH_EXCHANGE, SIGNAL_JOB_WAITING_BATCH_QUEUE,
    SIGNAL_JOB_WAITING_BATCH_ROUTING_KEY, SignalJobPendingBatchMessage,
    SignalJobSubmissionBatchMessage, SignalRunPayload, push_to_pending_queue,
    push_to_submissions_queue,
};

/// Represents a signal run with its current state and metadata.
/// Used to track individual runs.
#[derive(Debug, Clone, Serialize)]
pub struct SignalRun {
    pub run_id: Uuid,
    pub project_id: Uuid,
    pub job_id: Uuid,
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
