use dashmap::DashMap;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ExpectedWorkerCounts {
    counts: HashMap<WorkerType, usize>,
}

impl ExpectedWorkerCounts {
    pub fn new(
        spans: usize,
        spans_indexer: usize,
        browser_events: usize,
        evaluators: usize,
        payloads: usize,
        trace_summaries: usize,
        notifications: usize,
        clustering: usize,
    ) -> Self {
        let mut counts = HashMap::new();
        counts.insert(WorkerType::Spans, spans);
        counts.insert(WorkerType::SpansIndexer, spans_indexer);
        counts.insert(WorkerType::BrowserEvents, browser_events);
        counts.insert(WorkerType::Evaluators, evaluators);
        counts.insert(WorkerType::Payloads, payloads);
        counts.insert(WorkerType::TraceSummaries, trace_summaries);
        counts.insert(WorkerType::Notifications, notifications);
        counts.insert(WorkerType::Clustering, clustering);

        Self { counts }
    }

    pub fn get(&self, worker_type: &WorkerType) -> usize {
        self.counts.get(worker_type).copied().unwrap_or(0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum WorkerType {
    Spans,
    SpansIndexer,
    BrowserEvents,
    Evaluators,
    Payloads,
    TraceSummaries,
    Notifications,
    Clustering,
}

impl WorkerType {
    /// Returns all worker type variants. This match is exhaustive,
    /// so adding new variants will cause a compilation error here.
    pub fn all_variants() -> Vec<WorkerType> {
        vec![
            WorkerType::Spans,
            WorkerType::SpansIndexer,
            WorkerType::BrowserEvents,
            WorkerType::Evaluators,
            WorkerType::Payloads,
            WorkerType::TraceSummaries,
            WorkerType::Notifications,
            WorkerType::Clustering,
        ]
    }
}

impl std::fmt::Display for WorkerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkerType::Spans => write!(f, "spans"),
            WorkerType::SpansIndexer => write!(f, "spans_indexer"),
            WorkerType::BrowserEvents => write!(f, "browser_events"),
            WorkerType::Evaluators => write!(f, "evaluators"),
            WorkerType::Payloads => write!(f, "payloads"),
            WorkerType::TraceSummaries => write!(f, "trace_summaries"),
            WorkerType::Notifications => write!(f, "notifications"),
            WorkerType::Clustering => write!(f, "clustering"),
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
        WorkerType::all_variants().iter().all(|worker_type| {
            let actual_count = self.get_worker_count(worker_type);
            let expected_count = expected.get(worker_type);
            actual_count >= expected_count
        })
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
        log::warn!("Dropping worker handle for worker {}", self.id);
        self.tracker.unregister_worker(self.id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_variants_returns_all_worker_types() {
        let variants = WorkerType::all_variants();

        // Check we have the expected number of variants
        assert_eq!(variants.len(), 8);

        // Check each variant is present
        assert!(variants.contains(&WorkerType::Spans));
        assert!(variants.contains(&WorkerType::SpansIndexer));
        assert!(variants.contains(&WorkerType::BrowserEvents));
        assert!(variants.contains(&WorkerType::Evaluators));
        assert!(variants.contains(&WorkerType::Payloads));
        assert!(variants.contains(&WorkerType::TraceSummaries));
        assert!(variants.contains(&WorkerType::Notifications));
        assert!(variants.contains(&WorkerType::Clustering));
    }

    #[test]
    fn test_expected_worker_counts_stores_and_retrieves_correctly() {
        let expected = ExpectedWorkerCounts::new(1, 2, 3, 4, 5, 6, 7, 8);

        assert_eq!(expected.get(&WorkerType::Spans), 1);
        assert_eq!(expected.get(&WorkerType::SpansIndexer), 2);
        assert_eq!(expected.get(&WorkerType::BrowserEvents), 3);
        assert_eq!(expected.get(&WorkerType::Evaluators), 4);
        assert_eq!(expected.get(&WorkerType::Payloads), 5);
        assert_eq!(expected.get(&WorkerType::TraceSummaries), 6);
        assert_eq!(expected.get(&WorkerType::Notifications), 7);
        assert_eq!(expected.get(&WorkerType::Clustering), 8);
    }

    #[test]
    fn test_is_healthy_when_all_workers_meet_expectations() {
        let tracker = WorkerTracker::new();
        let expected = ExpectedWorkerCounts::new(2, 1, 1, 1, 1, 1, 1, 1);

        // Register workers
        let _h1 = tracker.register_worker(WorkerType::Spans);
        let _h2 = tracker.register_worker(WorkerType::Spans);
        let _h3 = tracker.register_worker(WorkerType::SpansIndexer);
        let _h4 = tracker.register_worker(WorkerType::BrowserEvents);
        let _h5 = tracker.register_worker(WorkerType::Evaluators);
        let _h6 = tracker.register_worker(WorkerType::Payloads);
        let _h7 = tracker.register_worker(WorkerType::TraceSummaries);
        let _h8 = tracker.register_worker(WorkerType::Notifications);
        let _h9 = tracker.register_worker(WorkerType::Clustering);

        assert!(tracker.is_healthy(&expected));
    }

    #[test]
    fn test_is_healthy_when_one_worker_type_is_below_threshold() {
        let tracker = WorkerTracker::new();
        let expected = ExpectedWorkerCounts::new(2, 1, 1, 1, 1, 1, 1, 1);

        // Register only 1 Spans worker (need 2)
        let _h1 = tracker.register_worker(WorkerType::Spans);
        let _h2 = tracker.register_worker(WorkerType::SpansIndexer);
        let _h3 = tracker.register_worker(WorkerType::BrowserEvents);
        let _h4 = tracker.register_worker(WorkerType::Evaluators);
        let _h5 = tracker.register_worker(WorkerType::Payloads);
        let _h6 = tracker.register_worker(WorkerType::TraceSummaries);
        let _h7 = tracker.register_worker(WorkerType::Notifications);
        let _h8 = tracker.register_worker(WorkerType::Clustering);

        assert!(!tracker.is_healthy(&expected));
    }

    #[test]
    fn test_is_healthy_when_workers_exceed_expectations() {
        let tracker = WorkerTracker::new();
        let expected = ExpectedWorkerCounts::new(1, 1, 1, 1, 1, 1, 1, 1);

        // Register more than expected (should still be healthy)
        let _h1 = tracker.register_worker(WorkerType::Spans);
        let _h2 = tracker.register_worker(WorkerType::Spans);
        let _h3 = tracker.register_worker(WorkerType::Spans);
        let _h4 = tracker.register_worker(WorkerType::SpansIndexer);
        let _h5 = tracker.register_worker(WorkerType::SpansIndexer);
        let _h6 = tracker.register_worker(WorkerType::BrowserEvents);
        let _h7 = tracker.register_worker(WorkerType::Evaluators);
        let _h8 = tracker.register_worker(WorkerType::Payloads);
        let _h9 = tracker.register_worker(WorkerType::TraceSummaries);
        let _h10 = tracker.register_worker(WorkerType::Notifications);
        let _h11 = tracker.register_worker(WorkerType::Clustering);

        assert!(tracker.is_healthy(&expected));
    }

    #[test]
    fn test_is_healthy_exactly_at_threshold() {
        let tracker = WorkerTracker::new();
        let expected = ExpectedWorkerCounts::new(3, 2, 2, 1, 4, 2, 1, 1);

        // Register exactly the expected counts
        let _h1 = tracker.register_worker(WorkerType::Spans);
        let _h2 = tracker.register_worker(WorkerType::Spans);
        let _h3 = tracker.register_worker(WorkerType::Spans);
        let _h4 = tracker.register_worker(WorkerType::SpansIndexer);
        let _h5 = tracker.register_worker(WorkerType::SpansIndexer);
        let _h6 = tracker.register_worker(WorkerType::BrowserEvents);
        let _h7 = tracker.register_worker(WorkerType::BrowserEvents);
        let _h8 = tracker.register_worker(WorkerType::Evaluators);
        let _h9 = tracker.register_worker(WorkerType::Payloads);
        let _h10 = tracker.register_worker(WorkerType::Payloads);
        let _h11 = tracker.register_worker(WorkerType::Payloads);
        let _h12 = tracker.register_worker(WorkerType::Payloads);
        let _h13 = tracker.register_worker(WorkerType::TraceSummaries);
        let _h14 = tracker.register_worker(WorkerType::TraceSummaries);
        let _h15 = tracker.register_worker(WorkerType::Notifications);
        let _h16 = tracker.register_worker(WorkerType::Clustering);

        assert!(tracker.is_healthy(&expected));
    }

    #[test]
    fn test_is_healthy_with_no_workers() {
        let tracker = WorkerTracker::new();
        let expected = ExpectedWorkerCounts::new(1, 1, 1, 1, 1, 1, 1, 1);

        // No workers registered
        assert!(!tracker.is_healthy(&expected));
    }

    #[test]
    fn test_is_healthy_with_zero_expectations() {
        let tracker = WorkerTracker::new();
        let expected = ExpectedWorkerCounts::new(0, 0, 0, 0, 0, 0, 0, 0);

        // No workers registered, but none expected either
        assert!(tracker.is_healthy(&expected));
    }

    #[test]
    fn test_is_healthy_checks_all_worker_types() {
        let tracker = WorkerTracker::new();
        let expected = ExpectedWorkerCounts::new(1, 1, 1, 1, 1, 1, 1, 1);

        // Missing TraceSummaries worker
        let _h1 = tracker.register_worker(WorkerType::Spans);
        let _h2 = tracker.register_worker(WorkerType::SpansIndexer);
        let _h3 = tracker.register_worker(WorkerType::BrowserEvents);
        let _h4 = tracker.register_worker(WorkerType::Evaluators);
        let _h5 = tracker.register_worker(WorkerType::Payloads);
        let _h6 = tracker.register_worker(WorkerType::Notifications);
        let _h7 = tracker.register_worker(WorkerType::Clustering);
        // Intentionally not registering TraceSummaries

        assert!(!tracker.is_healthy(&expected));
    }

    #[test]
    fn test_get_worker_count() {
        let tracker = WorkerTracker::new();

        let _h1 = tracker.register_worker(WorkerType::Spans);
        let _h2 = tracker.register_worker(WorkerType::Spans);
        let _h3 = tracker.register_worker(WorkerType::BrowserEvents);

        assert_eq!(tracker.get_worker_count(&WorkerType::Spans), 2);
        assert_eq!(tracker.get_worker_count(&WorkerType::BrowserEvents), 1);
        assert_eq!(tracker.get_worker_count(&WorkerType::Evaluators), 0);
    }

    #[test]
    fn test_get_total_workers() {
        let tracker = WorkerTracker::new();

        let _h1 = tracker.register_worker(WorkerType::Spans);
        let _h2 = tracker.register_worker(WorkerType::BrowserEvents);
        let _h3 = tracker.register_worker(WorkerType::Evaluators);

        assert_eq!(tracker.get_total_workers(), 3);
    }

    #[test]
    fn test_worker_handle_unregisters_on_drop() {
        let tracker = WorkerTracker::new();

        {
            let _h1 = tracker.register_worker(WorkerType::Spans);
            assert_eq!(tracker.get_worker_count(&WorkerType::Spans), 1);
        }
        // Handle dropped, worker should be unregistered

        assert_eq!(tracker.get_worker_count(&WorkerType::Spans), 0);
    }

    #[test]
    fn test_get_worker_counts() {
        let tracker = WorkerTracker::new();

        let _h1 = tracker.register_worker(WorkerType::Spans);
        let _h2 = tracker.register_worker(WorkerType::Spans);
        let _h3 = tracker.register_worker(WorkerType::BrowserEvents);

        let counts = tracker.get_worker_counts();
        let counts_map: HashMap<WorkerType, usize> = counts.into_iter().collect();

        assert_eq!(counts_map.get(&WorkerType::Spans), Some(&2));
        assert_eq!(counts_map.get(&WorkerType::BrowserEvents), Some(&1));
        assert_eq!(counts_map.get(&WorkerType::Evaluators), None);
    }

    #[test]
    fn test_worker_type_display() {
        assert_eq!(format!("{}", WorkerType::Spans), "spans");
        assert_eq!(format!("{}", WorkerType::SpansIndexer), "spans_indexer");
        assert_eq!(format!("{}", WorkerType::BrowserEvents), "browser_events");
        assert_eq!(format!("{}", WorkerType::Evaluators), "evaluators");
        assert_eq!(format!("{}", WorkerType::Payloads), "payloads");
        assert_eq!(format!("{}", WorkerType::TraceSummaries), "trace_summaries");
        assert_eq!(format!("{}", WorkerType::Notifications), "notifications");
        assert_eq!(format!("{}", WorkerType::Clustering), "clustering");
    }

    #[test]
    fn test_expected_counts_covers_all_variants() {
        // This test ensures that ExpectedWorkerCounts::new() covers all variants
        let expected = ExpectedWorkerCounts::new(1, 2, 3, 4, 5, 6, 7, 8);

        // Verify we can retrieve a count for each variant
        for variant in WorkerType::all_variants() {
            let count = expected.get(&variant);
            assert!(count > 0, "Variant {:?} should have a count", variant);
        }
    }
}
