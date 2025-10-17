use dashmap::DashMap;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ExpectedWorkerCounts {
    pub spans: usize,
    pub browser_events: usize,
    pub evaluators: usize,
    pub payloads: usize,
    pub trace_summaries: usize,
}

impl ExpectedWorkerCounts {
    pub fn new(
        spans: usize,
        browser_events: usize,
        evaluators: usize,
        payloads: usize,
        trace_summaries: usize,
    ) -> Self {
        Self {
            spans,
            browser_events,
            evaluators,
            payloads,
            trace_summaries,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum WorkerType {
    Spans,
    BrowserEvents,
    Evaluators,
    Payloads,
    TraceSummaries,
}

impl std::fmt::Display for WorkerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkerType::Spans => write!(f, "spans"),
            WorkerType::BrowserEvents => write!(f, "browser_events"),
            WorkerType::Evaluators => write!(f, "evaluators"),
            WorkerType::Payloads => write!(f, "payloads"),
            WorkerType::TraceSummaries => write!(f, "trace_summaries"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct WorkerTracker {
    workers: Arc<DashMap<Uuid, WorkerType>>,
}

impl WorkerTracker {
    pub fn new() -> Self {
        Self {
            workers: Arc::new(DashMap::new()),
        }
    }

    pub fn register_worker(&self, worker_type: WorkerType) -> WorkerHandle {
        let worker_id = Uuid::new_v4();
        self.workers.insert(worker_id, worker_type.clone());
        log::debug!("Registered worker {} of type {}", worker_id, worker_type);

        WorkerHandle {
            id: worker_id,
            tracker: self.clone(),
        }
    }

    pub fn get_worker_count(&self, worker_type: &WorkerType) -> usize {
        self.workers
            .iter()
            .filter(|entry| entry.value() == worker_type)
            .count()
    }

    pub fn get_total_workers(&self) -> usize {
        self.workers.len()
    }

    pub fn get_worker_counts(&self) -> Vec<(WorkerType, usize)> {
        let mut counts = std::collections::HashMap::new();
        for entry in self.workers.iter() {
            *counts.entry(entry.value().clone()).or_insert(0) += 1;
        }
        counts.into_iter().collect()
    }

    pub fn is_healthy(&self, expected: &ExpectedWorkerCounts) -> bool {
        let spans_count = self.get_worker_count(&WorkerType::Spans);
        let browser_events_count = self.get_worker_count(&WorkerType::BrowserEvents);
        let evaluators_count = self.get_worker_count(&WorkerType::Evaluators);

        spans_count >= expected.spans
            && browser_events_count >= expected.browser_events
            && evaluators_count >= expected.evaluators
    }

    fn unregister_worker(&self, worker_id: Uuid) {
        if let Some((_, worker_type)) = self.workers.remove(&worker_id) {
            log::debug!("Unregistered worker {} of type {}", worker_id, worker_type);
        }
    }
}

pub struct WorkerHandle {
    id: Uuid,
    tracker: WorkerTracker,
}

impl Drop for WorkerHandle {
    fn drop(&mut self) {
        log::error!("Dropping worker handle for worker {}", self.id);
        self.tracker.unregister_worker(self.id);
    }
}
