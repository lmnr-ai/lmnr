use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::result::Result;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::Instant;

use super::{CacheError, CacheTrait, LockClaim};
use moka::ops::compute::{CompResult, Op};

const DEFAULT_CACHE_SIZE: u64 = 100;

#[derive(Clone)]
struct CacheValue {
    bytes: Vec<u8>,
    expires_at: Option<Instant>,
}

impl CacheValue {
    fn is_expired_at(&self, now: Instant) -> bool {
        self.expires_at.is_some_and(|expires_at| expires_at <= now)
    }
}

pub struct InMemoryCache {
    cache: moka::future::Cache<String, CacheValue>,
    locks: Arc<RwLock<HashMap<String, Instant>>>,
    sorted_sets: Arc<RwLock<HashMap<String, HashSet<String>>>>,
}

impl InMemoryCache {
    pub fn new(capacity: Option<u64>) -> Self {
        Self {
            cache: moka::future::Cache::new(capacity.unwrap_or(DEFAULT_CACHE_SIZE)),
            locks: Arc::new(RwLock::new(HashMap::new())),
            sorted_sets: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

fn schedule_expiration(
    cache: moka::future::Cache<String, CacheValue>,
    key: String,
    expires_at: Instant,
) {
    tokio::spawn(async move {
        tokio::time::sleep_until(expires_at).await;
        remove_if_expired(&cache, &key).await;
    });
}

async fn remove_if_expired(cache: &moka::future::Cache<String, CacheValue>, key: &str) {
    cache
        .entry_by_ref(key)
        .and_compute_with(|maybe_entry| {
            let op = match maybe_entry {
                Some(entry) if entry.value().is_expired_at(Instant::now()) => Op::Remove,
                _ => Op::Nop,
            };
            std::future::ready(op)
        })
        .await;
}

fn schedule_new_expiration(
    cache: &moka::future::Cache<String, CacheValue>,
    key: &str,
    result: CompResult<String, CacheValue>,
) {
    if let CompResult::Inserted(entry) | CompResult::ReplacedWith(entry) = result
        && let Some(expires_at) = entry.into_value().expires_at
    {
        schedule_expiration(cache.clone(), key.to_string(), expires_at);
    }
}

impl CacheTrait for InMemoryCache {
    async fn get<T>(&self, key: &str) -> Result<Option<T>, CacheError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let Some(value) = self.cache.get(key).await else {
            return Ok(None);
        };
        if value.is_expired_at(Instant::now()) {
            return Ok(None);
        }

        let decoded = serde_json::from_slice(&value.bytes).map_err(CacheError::SerDeError)?;
        Ok(Some(decoded))
    }

    async fn insert<T>(&self, key: &str, value: T) -> Result<(), CacheError>
    where
        T: Serialize + Send,
    {
        let bytes = serde_json::to_vec(&value).map_err(CacheError::SerDeError)?;
        self.cache
            .entry_by_ref(key)
            .and_compute_with(move |_| {
                std::future::ready(Op::Put(CacheValue {
                    bytes,
                    expires_at: None,
                }))
            })
            .await;
        Ok(())
    }

    async fn remove(&self, key: &str) -> Result<(), CacheError> {
        self.cache
            .entry_by_ref(key)
            .and_compute_with(|_| std::future::ready(Op::Remove))
            .await;
        Ok(())
    }

    async fn set_ttl(&self, key: &str, seconds: u64) -> Result<(), CacheError> {
        let ttl = Duration::from_secs(seconds);
        let result = self
            .cache
            .entry_by_ref(key)
            .and_compute_with(move |maybe_entry| {
                let now = Instant::now();
                let op = match maybe_entry {
                    Some(entry) if !entry.value().is_expired_at(now) => {
                        let mut value = entry.into_value();
                        value.expires_at = Some(now + ttl);
                        Op::Put(value)
                    }
                    Some(_) => Op::Remove,
                    None => Op::Nop,
                };
                std::future::ready(op)
            })
            .await;
        schedule_new_expiration(&self.cache, key, result);
        Ok(())
    }

    async fn insert_with_ttl<T>(&self, key: &str, value: T, seconds: u64) -> Result<(), CacheError>
    where
        T: Serialize + Send,
    {
        let bytes = serde_json::to_vec(&value).map_err(CacheError::SerDeError)?;
        let ttl = Duration::from_secs(seconds);
        let result = self
            .cache
            .entry_by_ref(key)
            .and_compute_with(move |_| {
                let value = CacheValue {
                    bytes,
                    expires_at: Some(Instant::now() + ttl),
                };
                std::future::ready(Op::Put(value))
            })
            .await;
        schedule_new_expiration(&self.cache, key, result);
        Ok(())
    }

    async fn increment(&self, key: &str, amount: i64) -> Result<i64, CacheError> {
        let result = self
            .cache
            .entry_by_ref(key)
            .and_try_compute_with(|maybe_entry| async move {
                let now = Instant::now();
                let (current_value, expires_at) = match maybe_entry {
                    Some(entry) if !entry.value().is_expired_at(now) => {
                        let value = entry.into_value();
                        (
                            serde_json::from_slice(&value.bytes).map_err(CacheError::SerDeError)?,
                            value.expires_at,
                        )
                    }
                    Some(_) | None => (0, None),
                };

                // Like Redis INCRBY, an absent or expired key starts at zero.
                let new_value = current_value + amount;
                let bytes = serde_json::to_vec(&new_value).map_err(CacheError::SerDeError)?;
                Ok::<_, CacheError>(Op::Put(CacheValue { bytes, expires_at }))
            })
            .await?;

        let entry = result
            .into_entry()
            .expect("increment always inserts or replaces a value");
        let new_value =
            serde_json::from_slice(&entry.into_value().bytes).map_err(CacheError::SerDeError)?;
        Ok(new_value)
    }

    async fn try_acquire_lock(&self, key: &str, ttl_seconds: u64) -> Result<bool, CacheError> {
        let mut locks = self.locks.write().await;
        let now = tokio::time::Instant::now();
        let expiry = now + Duration::from_secs(ttl_seconds);

        // Clean up expired locks
        locks.retain(|_, &mut expires_at| expires_at > now);

        // Try to acquire lock
        if locks.contains_key(key) {
            Ok(false)
        } else {
            locks.insert(key.to_string(), expiry);
            Ok(true)
        }
    }

    async fn try_acquire_lock_with_owner(
        &self,
        key: &str,
        owner: &str,
        ttl_seconds: u64,
    ) -> Result<LockClaim, CacheError> {
        let bytes = serde_json::to_vec(owner).map_err(CacheError::SerDeError)?;
        let ttl = Duration::from_secs(ttl_seconds);
        let result = self
            .cache
            .entry_by_ref(key)
            .and_compute_with(move |maybe_entry| {
                let now = Instant::now();
                let op = match maybe_entry {
                    Some(entry) if !entry.value().is_expired_at(now) => Op::Nop,
                    Some(_) | None => Op::Put(CacheValue {
                        bytes,
                        expires_at: Some(now + ttl),
                    }),
                };
                std::future::ready(op)
            })
            .await;

        match result {
            CompResult::Inserted(entry) | CompResult::ReplacedWith(entry) => {
                if let Some(expires_at) = entry.into_value().expires_at {
                    schedule_expiration(self.cache.clone(), key.to_string(), expires_at);
                }
                Ok(LockClaim::Acquired)
            }
            CompResult::Unchanged(entry) => Ok(LockClaim::Held(
                serde_json::from_slice(&entry.into_value().bytes).ok(),
            )),
            CompResult::StillNone(_) | CompResult::Removed(_) => {
                unreachable!("lock claim only inserts or leaves a live value unchanged")
            }
        }
    }

    async fn renew_lock(&self, key: &str, ttl_seconds: u64) -> Result<bool, CacheError> {
        let mut locks = self.locks.write().await;
        let now = tokio::time::Instant::now();
        // Drop expired locks first so a stale entry can't be "renewed".
        locks.retain(|_, &mut expires_at| expires_at > now);
        match locks.get_mut(key) {
            Some(expiry) => {
                *expiry = now + Duration::from_secs(ttl_seconds);
                Ok(true)
            }
            None => Ok(false),
        }
    }

    async fn release_lock(&self, key: &str) -> Result<(), CacheError> {
        let mut locks = self.locks.write().await;
        locks.remove(key);
        Ok(())
    }

    async fn zadd(&self, key: &str, _score: f64, member: &str) -> Result<(), CacheError> {
        let mut sets = self.sorted_sets.write().await;
        sets.entry(key.to_string())
            .or_insert_with(HashSet::new)
            .insert(member.to_string());
        Ok(())
    }

    async fn pipe_zadd(&self, key: &str, members: &[String]) -> Result<(), CacheError> {
        for member in members {
            self.zadd(key, 0.0, member).await?;
        }
        Ok(())
    }

    async fn exists(&self, key: &str) -> Result<bool, CacheError> {
        // Check both regular cache and sorted sets
        let in_cache = self
            .cache
            .get(key)
            .await
            .is_some_and(|value| !value.is_expired_at(Instant::now()));
        let in_sorted_sets = self.sorted_sets.read().await.contains_key(key);
        Ok(in_cache || in_sorted_sets)
    }

    fn is_healthy(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::sync::Barrier;

    /// `try_acquire_lock_with_owner` must admit exactly ONE of N simultaneous
    /// claimants. Callers rely on this to serialize work (see the signals
    /// per-trace exclusive claim); a `get`-then-`insert` implementation lets
    /// every claimant observe an empty key and all of them proceed.
    ///
    /// Needs a multi-thread runtime plus a barrier: on a single-threaded runtime
    /// each future runs to completion before the next is polled, so the race
    /// never opens and a non-atomic implementation passes. Repeated over many
    /// rounds because one round can get lucky.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn try_acquire_lock_with_owner_admits_exactly_one_concurrent_claimant() {
        const CLAIMANTS: usize = 8;
        const ROUNDS: usize = 200;

        let cache = Arc::new(InMemoryCache::new(Some(ROUNDS as u64 * 2)));

        for round in 0..ROUNDS {
            let key = format!("claim-race-{round}");
            let barrier = Arc::new(Barrier::new(CLAIMANTS));

            let claimants = (0..CLAIMANTS).map(|i| {
                let cache = cache.clone();
                let barrier = barrier.clone();
                let key = key.clone();
                tokio::spawn(async move {
                    // Line every task up so they contend for real.
                    barrier.wait().await;
                    cache
                        .try_acquire_lock_with_owner(&key, &format!("owner-{i}"), 60)
                        .await
                        .unwrap()
                })
            });

            let winners = futures_util::future::join_all(claimants)
                .await
                .into_iter()
                .filter(|claim| *claim.as_ref().unwrap() == LockClaim::Acquired)
                .count();

            assert_eq!(
                winners, 1,
                "round {round}: exactly one claimant may win, got {winners}"
            );
        }
    }

    /// The claim must be readable through `get` (callers refresh its TTL through
    /// the same keyspace) and clearable through `remove` — i.e. it lives in the
    /// main keyspace, not the separate `locks` map `try_acquire_lock` uses.
    #[tokio::test]
    async fn try_acquire_lock_with_owner_is_visible_to_get_and_remove() {
        let cache = InMemoryCache::new(None);

        assert_eq!(
            cache
                .try_acquire_lock_with_owner("k", "owner-a", 60)
                .await
                .unwrap(),
            LockClaim::Acquired
        );
        assert_eq!(
            cache.get::<String>("k").await.unwrap(),
            Some("owner-a".to_string()),
            "the owner must be readable back"
        );
        assert_eq!(
            cache
                .try_acquire_lock_with_owner("k", "owner-b", 60)
                .await
                .unwrap(),
            LockClaim::Held(Some("owner-a".to_string())),
            "a held claim must not be reassignable, and must name its holder"
        );

        cache.remove("k").await.unwrap();
        assert_eq!(
            cache
                .try_acquire_lock_with_owner("k", "owner-b", 60)
                .await
                .unwrap(),
            LockClaim::Acquired,
            "the claim must be retakeable once removed"
        );
    }

    /// A failed claim must report the holder in the SAME call — callers compare
    /// it against their own identity to tell a redelivery of their own work from
    /// a genuine competitor. Pins that contract; the race it exists to close (a
    /// separate `get` catching the holder mid-release and reporting nobody) needs
    /// an interleaving this test can't stage.
    #[tokio::test]
    async fn a_failed_claim_names_its_holder() {
        let cache = InMemoryCache::new(None);

        cache
            .try_acquire_lock_with_owner("k", "run-1", 60)
            .await
            .unwrap();

        // Same owner: a redelivery recognizing its own claim.
        assert_eq!(
            cache
                .try_acquire_lock_with_owner("k", "run-1", 60)
                .await
                .unwrap(),
            LockClaim::Held(Some("run-1".to_string()))
        );
        // Different owner: a competitor.
        assert_eq!(
            cache
                .try_acquire_lock_with_owner("k", "run-2", 60)
                .await
                .unwrap(),
            LockClaim::Held(Some("run-1".to_string()))
        );
    }

    /// A value that isn't an owner string at all — e.g. a key written by
    /// something other than this primitive — must read as held-by-unknown rather
    /// than erroring the claim. Callers can't treat it as their own, and it ages
    /// out with its TTL.
    #[tokio::test]
    async fn an_undecodable_holder_is_held_by_unknown() {
        let cache = InMemoryCache::new(None);

        cache.insert("k", 42u64).await.unwrap();

        assert_eq!(
            cache
                .try_acquire_lock_with_owner("k", "run-1", 60)
                .await
                .unwrap(),
            LockClaim::Held(None)
        );
    }

    #[tokio::test(start_paused = true)]
    async fn stale_expiration_cannot_remove_refreshed_replaced_or_reinserted_values() {
        let cache = InMemoryCache::new(None);

        cache
            .insert_with_ttl("refreshed", "value", 10)
            .await
            .unwrap();
        let refreshed_deadline = cache
            .cache
            .get("refreshed")
            .await
            .unwrap()
            .expires_at
            .unwrap();

        cache.insert_with_ttl("plain", "old", 10).await.unwrap();
        let plain_deadline = cache.cache.get("plain").await.unwrap().expires_at.unwrap();

        cache
            .insert_with_ttl("reinserted", "old", 10)
            .await
            .unwrap();
        let reinserted_deadline = cache
            .cache
            .get("reinserted")
            .await
            .unwrap()
            .expires_at
            .unwrap();

        tokio::time::advance(Duration::from_secs(5)).await;
        cache.set_ttl("refreshed", 10).await.unwrap();
        cache.insert("plain", "new").await.unwrap();
        cache.remove("reinserted").await.unwrap();
        cache
            .insert_with_ttl("reinserted", "new", 10)
            .await
            .unwrap();

        // Simulate the original timers after their deadlines. Each timer must
        // re-check the value currently stored for its key under the key lock.
        tokio::time::advance(Duration::from_secs(5)).await;
        for (key, old_deadline) in [
            ("refreshed", refreshed_deadline),
            ("plain", plain_deadline),
            ("reinserted", reinserted_deadline),
        ] {
            assert!(old_deadline <= Instant::now());
            remove_if_expired(&cache.cache, key).await;
        }

        assert_eq!(
            cache.get::<String>("refreshed").await.unwrap(),
            Some("value".into())
        );
        assert_eq!(
            cache.get::<String>("plain").await.unwrap(),
            Some("new".into())
        );
        assert_eq!(
            cache.get::<String>("reinserted").await.unwrap(),
            Some("new".into())
        );
        assert!(cache.exists("refreshed").await.unwrap());

        tokio::time::advance(Duration::from_secs(5)).await;
        remove_if_expired(&cache.cache, "refreshed").await;
        remove_if_expired(&cache.cache, "reinserted").await;
        assert_eq!(cache.get::<String>("refreshed").await.unwrap(), None);
        assert_eq!(cache.get::<String>("reinserted").await.unwrap(), None);
        assert_eq!(
            cache.get::<String>("plain").await.unwrap(),
            Some("new".into())
        );
    }

    #[tokio::test(start_paused = true)]
    async fn scheduled_expiration_respects_refreshes_and_ttl_replacements() {
        let cache = Arc::new(InMemoryCache::new(None));
        cache
            .insert_with_ttl("refreshed", "same value", 10)
            .await
            .unwrap();
        cache
            .insert_with_ttl("replaced", "old value", 10)
            .await
            .unwrap();
        cache
            .insert_with_ttl("concurrent", "concurrent value", 10)
            .await
            .unwrap();

        tokio::time::sleep(Duration::from_secs(5)).await;
        cache.set_ttl("refreshed", 10).await.unwrap();
        cache
            .insert_with_ttl("replaced", "new value", 10)
            .await
            .unwrap();

        // Refresh from another task shortly before the original deadline while
        // this test waits through it, so the scheduled original timer runs too.
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let concurrent_cache = Arc::clone(&cache);
        let refresh_task = tokio::spawn(async move {
            let _ = started_tx.send(());
            tokio::time::sleep(Duration::from_secs(4)).await;
            concurrent_cache.set_ttl("concurrent", 10).await.unwrap();
        });
        started_rx.await.unwrap();

        tokio::time::sleep(Duration::from_secs(5)).await;
        refresh_task.await.unwrap();
        // Let detached expiration jobs due at the original deadline finish
        // before observing state through the public cache interface.
        tokio::time::sleep(Duration::from_millis(1)).await;

        assert_eq!(
            cache.get::<String>("refreshed").await.unwrap(),
            Some("same value".into())
        );
        assert_eq!(
            cache.get::<String>("replaced").await.unwrap(),
            Some("new value".into())
        );
        assert_eq!(
            cache.get::<String>("concurrent").await.unwrap(),
            Some("concurrent value".into())
        );

        // The two t=5 refreshes expire at t=15; the concurrent t=9 refresh at
        // t=19. The old timer must not extend or shorten those deadlines.
        tokio::time::sleep(Duration::from_secs(5)).await;
        assert_eq!(cache.get::<String>("refreshed").await.unwrap(), None);
        assert_eq!(cache.get::<String>("replaced").await.unwrap(), None);
        // `get` hides expired values even before the cleanup task removes them,
        // so also verify that scheduled cleanup physically evicted the entry.
        tokio::time::timeout(Duration::from_secs(1), async {
            while cache.cache.get("replaced").await.is_some() {
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
        })
        .await
        .expect("scheduled expiration should physically evict the replaced value");
        assert_eq!(
            cache.get::<String>("concurrent").await.unwrap(),
            Some("concurrent value".into())
        );

        tokio::time::sleep(Duration::from_secs(4)).await;
        assert_eq!(cache.get::<String>("concurrent").await.unwrap(), None);
    }

    #[tokio::test(start_paused = true)]
    async fn get_and_exists_hide_expired_values_before_cleanup_runs() {
        let cache = InMemoryCache::new(None);
        cache
            .cache
            .insert(
                "expired".to_string(),
                CacheValue {
                    bytes: serde_json::to_vec("value").unwrap(),
                    expires_at: Some(Instant::now()),
                },
            )
            .await;

        assert_eq!(cache.get::<String>("expired").await.unwrap(), None);
        assert!(!cache.exists("expired").await.unwrap());
        assert!(cache.cache.get("expired").await.is_some());
    }

    #[tokio::test(start_paused = true)]
    async fn increment_preserves_a_live_ttl_and_does_not_inherit_an_expired_ttl() {
        let cache = InMemoryCache::new(None);

        cache.insert_with_ttl("live", 5_i64, 10).await.unwrap();
        let live_deadline = cache.cache.get("live").await.unwrap().expires_at;
        tokio::time::advance(Duration::from_secs(5)).await;
        assert_eq!(cache.increment("live", 2).await.unwrap(), 7);
        assert_eq!(
            cache.cache.get("live").await.unwrap().expires_at,
            live_deadline
        );

        tokio::time::advance(Duration::from_secs(5)).await;
        remove_if_expired(&cache.cache, "live").await;
        assert_eq!(cache.get::<i64>("live").await.unwrap(), None);
        assert!(!cache.exists("live").await.unwrap());

        cache.insert_with_ttl("expired", 5_i64, 5).await.unwrap();
        let expired_deadline = cache
            .cache
            .get("expired")
            .await
            .unwrap()
            .expires_at
            .unwrap();
        tokio::time::advance(Duration::from_secs(5)).await;
        assert_eq!(cache.increment("expired", 2).await.unwrap(), 2);
        assert_eq!(cache.cache.get("expired").await.unwrap().expires_at, None);

        // The original timer must not remove the new, non-expiring counter.
        remove_if_expired(&cache.cache, "expired").await;
        assert_eq!(cache.get::<i64>("expired").await.unwrap(), Some(2));
        assert!(expired_deadline <= Instant::now());
    }

    #[tokio::test(start_paused = true)]
    async fn an_expired_owner_lock_can_be_reacquired_without_a_stale_timer_removing_it() {
        let cache = InMemoryCache::new(None);

        assert_eq!(
            cache
                .try_acquire_lock_with_owner("lock", "owner-a", 5)
                .await
                .unwrap(),
            LockClaim::Acquired
        );
        let old_deadline = cache.cache.get("lock").await.unwrap().expires_at.unwrap();

        tokio::time::advance(Duration::from_secs(5)).await;
        assert_eq!(
            cache
                .try_acquire_lock_with_owner("lock", "owner-b", 20)
                .await
                .unwrap(),
            LockClaim::Acquired
        );
        remove_if_expired(&cache.cache, "lock").await;

        assert_eq!(
            cache.get::<String>("lock").await.unwrap(),
            Some("owner-b".into())
        );
        assert_eq!(
            cache
                .try_acquire_lock_with_owner("lock", "owner-c", 20)
                .await
                .unwrap(),
            LockClaim::Held(Some("owner-b".into()))
        );
        assert!(old_deadline <= Instant::now());
    }
}
