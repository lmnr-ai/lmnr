//! The project's "MCP" dashboard, created the first time it ingests an MCP request. The charts and
//! the once-per-project rule live in the frontend (`lib/actions/dashboard/mcp-dashboard.ts`); this
//! module only notices MCP spans and asks once.

use std::{
    collections::HashSet,
    sync::{Arc, LazyLock},
};

use reqwest::Method;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{MCP_DASHBOARD_CACHE_KEY, MCP_DASHBOARD_LOCK_CACHE_KEY},
    },
    db::spans::Span,
    next_api,
};

/// A failed request holds the lock this long, so an unreachable frontend costs one call per
/// project per interval rather than one per ingest batch.
const RETRY_AFTER_SECS: u64 = 600;

static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(reqwest::Client::new);

/// Asks the frontend for the MCP dashboard of every project with an MCP span in `spans`, in the
/// background: ingestion never waits on it.
pub fn ensure_for_spans(spans: &[Span], cache: Arc<Cache>) {
    let project_ids: HashSet<Uuid> = spans
        .iter()
        .filter(|span| span.attributes.is_mcp_request())
        .map(|span| span.project_id)
        .collect();
    if project_ids.is_empty() {
        return;
    }
    tokio::spawn(async move {
        for project_id in project_ids {
            ensure(project_id, &cache).await;
        }
    });
}

async fn ensure(project_id: Uuid, cache: &Cache) {
    let done_key = format!("{MCP_DASHBOARD_CACHE_KEY}:{project_id}");
    match cache.get::<bool>(&done_key).await {
        Ok(Some(_)) => return,
        Ok(None) => {}
        Err(e) => {
            log::warn!("MCP dashboard: cache read failed for project {project_id}: {e:?}");
            return;
        }
    }
    let lock_key = format!("{MCP_DASHBOARD_LOCK_CACHE_KEY}:{project_id}");
    if !matches!(
        cache.try_acquire_lock(&lock_key, RETRY_AFTER_SECS).await,
        Ok(true)
    ) {
        return;
    }
    let result: Result<Value, _> = next_api::call(
        &HTTP_CLIENT,
        Method::POST,
        project_id,
        "dashboards/mcp",
        None,
    )
    .await;
    match result {
        Ok(_) => {
            if let Err(e) = cache.insert(&done_key, true).await {
                log::warn!("MCP dashboard: cache write failed for project {project_id}: {e:?}");
            }
            let _ = cache.release_lock(&lock_key).await;
        }
        // The lock stays held, which is the retry backoff.
        Err(e) => log::warn!(
            "MCP dashboard: creation failed for project {project_id}, retrying in {RETRY_AFTER_SECS}s: {e}"
        ),
    }
}
