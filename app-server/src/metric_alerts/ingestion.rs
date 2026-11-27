//! The data clock of metric alerts. A span batch carries the time it was
//! accepted, and each consumer process reports the oldest batch it is still
//! storing. The scheduler checks no minute a batch in flight can still add
//! spans to, so during a backlog checks run late instead of reading minutes
//! that are only partly stored.

use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex, MutexGuard, Once, PoisonError},
    time::Duration,
};

use uuid::Uuid;

use crate::cache::{
    Cache, CacheError, CacheTrait,
    keys::{SPANS_IN_FLIGHT_CACHE_KEY, SPANS_IN_FLIGHT_PROCESSES_CACHE_KEY},
};

const REPORT_INTERVAL: Duration = Duration::from_secs(1);
/// A process that stops reporting stops holding the clock after this long.
/// Its unacked batches are redelivered and reported by whoever takes them.
const REPORT_TTL_SECONDS: u64 = 30;
/// Reports a process keeps its last value for after its last batch. Covers
/// the gap between two batches, when the next one is still in the queue.
const IDLE_GRACE_REPORTS: u32 = 10;

/// The batches this process is storing, by the time they were accepted.
#[derive(Default)]
struct InFlight {
    next_id: u64,
    batches: BTreeMap<u64, i64>,
    /// The oldest batch begun since the last report, so a batch that came
    /// and went between two reports is still seen.
    begun: Option<i64>,
}

impl InFlight {
    fn begin(&mut self, accepted_at_ms: i64) -> u64 {
        self.next_id += 1;
        self.batches.insert(self.next_id, accepted_at_ms);
        self.begun = Some(self.begun.map_or(accepted_at_ms, |b| b.min(accepted_at_ms)));
        self.next_id
    }

    fn oldest(&mut self) -> Option<i64> {
        let in_flight = self.batches.values().min().copied();
        [in_flight, self.begun.take()].into_iter().flatten().min()
    }
}

static IN_FLIGHT: Mutex<InFlight> = Mutex::new(InFlight {
    next_id: 0,
    batches: BTreeMap::new(),
    begun: None,
});
static REPORTER: Once = Once::new();

fn in_flight() -> MutexGuard<'static, InFlight> {
    IN_FLIGHT.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Holds the data clock at its batch until dropped.
pub struct InFlightBatch(u64);

impl Drop for InFlightBatch {
    fn drop(&mut self) {
        in_flight().batches.remove(&self.0);
    }
}

/// Called when a consumer starts on a batch whose oldest spans were accepted
/// at `accepted_at_ms`. Drop the guard once the spans are stored.
pub fn begin(cache: &Arc<Cache>, accepted_at_ms: i64) -> InFlightBatch {
    let id = in_flight().begin(accepted_at_ms);
    REPORTER.call_once(|| {
        tokio::spawn(report(cache.clone()));
    });
    InFlightBatch(id)
}

/// What a process reports, one reading at a time.
#[derive(Default)]
struct Held {
    value: Option<i64>,
    idle_reports: u32,
}

impl Held {
    fn next(&mut self, oldest: Option<i64>) -> Option<i64> {
        match oldest {
            Some(oldest) => {
                self.value = Some(oldest);
                self.idle_reports = 0;
            }
            None => {
                self.idle_reports += 1;
                if self.idle_reports > IDLE_GRACE_REPORTS {
                    self.value = None;
                }
            }
        }
        self.value
    }
}

fn report_key(process: &str) -> String {
    format!("{SPANS_IN_FLIGHT_CACHE_KEY}:{process}")
}

async fn write_report(cache: &Cache, process: &str, value: Option<i64>) -> Result<(), CacheError> {
    let key = report_key(process);
    match value {
        Some(oldest) => {
            cache
                .insert_with_ttl(&key, oldest, REPORT_TTL_SECONDS)
                .await?;
            cache
                .zadd(SPANS_IN_FLIGHT_PROCESSES_CACHE_KEY, 0.0, process)
                .await
        }
        None => {
            cache.remove(&key).await?;
            cache
                .zrem(SPANS_IN_FLIGHT_PROCESSES_CACHE_KEY, process)
                .await
        }
    }
}

/// Reports this process's oldest batch in flight every second, and nothing
/// while it is idle.
async fn report(cache: Arc<Cache>) {
    let process = Uuid::new_v4().to_string();
    let mut held = Held::default();
    let mut reported = false;
    let mut interval = tokio::time::interval(REPORT_INTERVAL);
    loop {
        interval.tick().await;
        let oldest = in_flight().oldest();
        let value = held.next(oldest);
        if value.is_none() && !reported {
            continue;
        }
        match write_report(&cache, &process, value).await {
            Ok(()) => reported = value.is_some(),
            Err(e) => log::warn!("[Metric alerts] Failed to report spans in flight: {e:?}"),
        }
    }
}

/// When the oldest batch any consumer is still storing was accepted, in unix
/// milliseconds. `None` when every consumer is idle.
pub async fn oldest_in_flight(cache: &Cache) -> Result<Option<i64>, CacheError> {
    let mut oldest: Option<i64> = None;
    for process in cache.zrange(SPANS_IN_FLIGHT_PROCESSES_CACHE_KEY).await? {
        match cache.get::<i64>(&report_key(&process)).await? {
            Some(reported) => oldest = Some(oldest.map_or(reported, |o| o.min(reported))),
            // The report expired, so the process is gone.
            None => {
                cache
                    .zrem(SPANS_IN_FLIGHT_PROCESSES_CACHE_KEY, &process)
                    .await?
            }
        }
    }
    Ok(oldest)
}

#[cfg(test)]
mod tests {
    use crate::cache::in_memory::InMemoryCache;

    use super::*;

    #[test]
    fn a_process_reports_its_oldest_batch_in_flight() {
        let mut in_flight = InFlight::default();
        assert_eq!(in_flight.oldest(), None, "idle");

        let old = in_flight.begin(1_000);
        let new = in_flight.begin(5_000);
        assert_eq!(in_flight.oldest(), Some(1_000));

        in_flight.batches.remove(&old);
        assert_eq!(in_flight.oldest(), Some(5_000));
        in_flight.batches.remove(&new);
        assert_eq!(in_flight.oldest(), None);

        // A batch stored between two reports is still seen once.
        let quick = in_flight.begin(7_000);
        in_flight.batches.remove(&quick);
        assert_eq!(in_flight.oldest(), Some(7_000));
        assert_eq!(in_flight.oldest(), None);
    }

    #[test]
    fn the_last_report_is_held_between_batches() {
        let mut held = Held::default();
        assert_eq!(held.next(None), None);
        assert_eq!(held.next(Some(1_000)), Some(1_000));
        for _ in 0..IDLE_GRACE_REPORTS {
            assert_eq!(held.next(None), Some(1_000));
        }
        assert_eq!(held.next(None), None, "idle for good");
        assert_eq!(held.next(Some(9_000)), Some(9_000));
    }

    #[tokio::test]
    async fn the_clock_reads_the_oldest_report_of_every_process() {
        let cache = Cache::InMemory(InMemoryCache::new(None));
        assert_eq!(oldest_in_flight(&cache).await.unwrap(), None);

        write_report(&cache, "a", Some(5_000)).await.unwrap();
        write_report(&cache, "b", Some(2_000)).await.unwrap();
        assert_eq!(oldest_in_flight(&cache).await.unwrap(), Some(2_000));

        // b goes idle and says so.
        write_report(&cache, "b", None).await.unwrap();
        assert_eq!(oldest_in_flight(&cache).await.unwrap(), Some(5_000));

        // a dies: its report expires and the scheduler forgets it.
        cache.remove(&report_key("a")).await.unwrap();
        assert_eq!(oldest_in_flight(&cache).await.unwrap(), None);
        let processes = cache.zrange(SPANS_IN_FLIGHT_PROCESSES_CACHE_KEY).await;
        assert!(processes.unwrap().is_empty());
    }
}
