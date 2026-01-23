use chrono::{DateTime, Utc};
use serde::Serialize;
use std::fmt;
use uuid::Uuid;

pub mod gemini;
pub mod pendings_consumer;
pub mod prompts;
pub mod queue;
pub mod spans;
pub mod submissions_consumer;
pub mod tools;
pub mod utils;

pub(crate) use queue::push_to_waiting_queue;
pub use queue::{
    SIGNAL_JOB_PENDING_BATCH_EXCHANGE, SIGNAL_JOB_PENDING_BATCH_QUEUE,
    SIGNAL_JOB_PENDING_BATCH_ROUTING_KEY, SIGNAL_JOB_SUBMISSION_BATCH_EXCHANGE,
    SIGNAL_JOB_SUBMISSION_BATCH_QUEUE, SIGNAL_JOB_SUBMISSION_BATCH_ROUTING_KEY,
    SIGNAL_JOB_WAITING_BATCH_EXCHANGE, SIGNAL_JOB_WAITING_BATCH_QUEUE,
    SIGNAL_JOB_WAITING_BATCH_ROUTING_KEY, SignalJobPendingBatchMessage,
    SignalJobSubmissionBatchMessage, SignalRunMessage, push_to_pending_queue,
    push_to_submissions_queue,
};

/// Represents a signal run with its current state and metadata.
/// Used to track individual runs.
#[derive(Debug, Clone, Copy, Serialize)]
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
    pub time: DateTime<Utc>,
    pub event_id: Option<Uuid>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub enum RunStatus {
    Completed,
    Failed,
    Pending,
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
