//! Periodic jemalloc statistics logging (LAM-2024 leak hunt).
//!
//! One log line per minute that splits the leak hypothesis space in two:
//! `allocated` is live Rust-heap bytes (everything currently owned by Rust
//! code), `resident` is what the OS charges the process. If `allocated`
//! climbs together with RSS, some Rust structure is genuinely retaining
//! memory (buffers, maps, channels) and the hunt is structural. If
//! `allocated` stays flat while `resident`/RSS climbs, the growth lives in
//! the allocator itself (fragmentation, retained dirty pages) and the fix is
//! jemalloc tuning, not code.
//!
//! Reads require the `stats` feature on `tikv-jemallocator` (enables
//! statistics gathering in the jemalloc build). `epoch::advance()` refreshes
//! the cached snapshot; without it every read returns boot-time values.

use std::time::Duration;

use tikv_jemalloc_ctl::{epoch, stats};

const LOG_INTERVAL: Duration = Duration::from_secs(60);

pub fn spawn_memory_stats_logger(handle: &tokio::runtime::Handle) {
    handle.spawn(async {
        let mut interval = tokio::time::interval(LOG_INTERVAL);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            interval.tick().await;
            log_memory_stats();
        }
    });
}

fn log_memory_stats() {
    let stats = match read_jemalloc_stats() {
        Ok(stats) => stats,
        Err(e) => {
            log::debug!("jemalloc stats unavailable: {e}");
            return;
        }
    };

    let rss = read_rss_bytes()
        .map(|b| format!("{:.1}", mb(b)))
        .unwrap_or_else(|| "n/a".to_string());

    log::info!(
        "jemalloc stats MB: allocated={:.1} active={:.1} resident={:.1} mapped={:.1} retained={:.1} metadata={:.1} rss={}",
        mb(stats.allocated),
        mb(stats.active),
        mb(stats.resident),
        mb(stats.mapped),
        mb(stats.retained),
        mb(stats.metadata),
        rss,
    );
}

struct JemallocStats {
    allocated: usize,
    active: usize,
    resident: usize,
    mapped: usize,
    retained: usize,
    metadata: usize,
}

fn read_jemalloc_stats() -> Result<JemallocStats, tikv_jemalloc_ctl::Error> {
    epoch::advance()?;
    Ok(JemallocStats {
        allocated: stats::allocated::read()?,
        active: stats::active::read()?,
        resident: stats::resident::read()?,
        mapped: stats::mapped::read()?,
        retained: stats::retained::read()?,
        metadata: stats::metadata::read()?,
    })
}

fn mb(bytes: usize) -> f64 {
    bytes as f64 / (1024.0 * 1024.0)
}

/// Resident set size as the kernel reports it — the number the container
/// limit is enforced against. Linux only; `None` elsewhere (dev machines).
fn read_rss_bytes() -> Option<usize> {
    let statm = std::fs::read_to_string("/proc/self/statm").ok()?;
    let resident_pages: usize = statm.split_whitespace().nth(1)?.parse().ok()?;
    Some(resident_pages * 4096)
}
