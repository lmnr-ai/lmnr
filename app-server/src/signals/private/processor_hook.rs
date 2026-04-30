//! Public entry point used by `traces/processor.rs` to evaluate signal
//! triggers against newly inserted traces and enqueue runs. This was
//! previously the private `check_and_push_signals` function inside
//! `traces/processor.rs`; moved here so the OSS-side processor can call
//! `crate::signals::check_and_push_signals` blindly (no-op stub when the
//! cargo feature is off).

use std::sync::Arc;

use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::SIGNAL_TRIGGER_LOCK_CACHE_KEY};
use crate::db::DB;
use crate::db::spans::Span;
use crate::db::trace::{Trace, TraceType};
use crate::features::{Feature, is_feature_enabled};
use crate::mq::MessageQueue;
use crate::signals::private::trigger::get_signal_triggers_cached;
use crate::traces::sampling::{get_sampling_factors_cached, should_sample_trace};
use crate::traces::utils::group_traces_by_project;
use crate::utils::limits::get_workspace_signal_runs_limit_exceeded;

const SIGNAL_TRIGGER_LOCK_TTL_SECONDS: u64 = 3600; // 1 hour

/// Public entry point. Returns immediately when the runtime feature is off
/// so callers (`traces/processor.rs`) avoid cloning/grouping work in the
/// hot ingestion path when signals are disabled.
pub async fn check_and_push_signals(
    updated_traces: &[Trace],
    spans: &[Span],
    db: Arc<DB>,
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
) {
    if !is_feature_enabled(Feature::Signals) {
        return;
    }

    let default_trace_type: i16 = Into::<u8>::into(TraceType::DEFAULT) as i16;
    let default_traces: Vec<Trace> = updated_traces
        .iter()
        .filter(|trace| trace.trace_type() == default_trace_type)
        .cloned()
        .collect();

    if default_traces.is_empty() {
        return;
    }

    let traces_by_project = group_traces_by_project(&default_traces);
    for (project_id, project_traces) in &traces_by_project {
        check_and_push_signals_for_project(
            *project_id,
            project_traces,
            spans,
            db.clone(),
            cache.clone(),
            clickhouse.clone(),
            queue.clone(),
        )
        .await;
    }
}

#[allow(clippy::too_many_arguments)]
async fn check_and_push_signals_for_project(
    project_id: Uuid,
    traces: &[&Trace],
    spans: &[Span],
    db: Arc<DB>,
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
) {
    let triggers = match get_signal_triggers_cached(db.clone(), cache.clone(), project_id).await {
        Ok(triggers) => triggers,
        Err(e) => {
            log::error!(
                "Failed to get signals triggers for project {}: {:?}",
                project_id,
                e
            );
            return;
        }
    };

    if triggers.is_empty() {
        return;
    }

    if is_feature_enabled(Feature::UsageLimit) {
        let signal_runs_exceeded = get_workspace_signal_runs_limit_exceeded(
            db.clone(),
            clickhouse.clone(),
            cache.clone(),
            project_id,
        )
        .await;
        if signal_runs_exceeded.is_ok_and(|exceeded| exceeded) {
            log::debug!(
                "Workspace signal runs limit exceeded for project [{}]. Skipping triggers.",
                project_id,
            );
            return;
        }
    }

    // Lazily fetch pre-computed sampling factors only if any trigger has sampling enabled
    let any_has_sampling = triggers.iter().any(|t| t.signal.sample_rate.is_some());
    let sampling_factors = if any_has_sampling {
        match get_sampling_factors_cached(cache.clone(), &clickhouse, project_id).await {
            Ok(factors) => Some(factors),
            Err(e) => {
                log::error!(
                    "Failed to get sampling factors for project {}: {:?}. \
                     Sampled signals will be skipped; non-sampled signals proceed normally.",
                    project_id,
                    e
                );
                None
            }
        }
    } else {
        None
    };

    for trigger in &triggers {
        let matching_traces = traces
            .iter()
            .filter(|trace| trace.matches_filters(spans, &trigger.filters));

        for trace in matching_traces {
            // Check sampling if enabled for this signal
            if let Some(sample_rate) = trigger.signal.sample_rate {
                if let Some(ref factors) = sampling_factors {
                    if !should_sample_trace(sample_rate, &trace.user_id(), factors) {
                        log::debug!(
                            "Skipping trace for user {}",
                            trace.user_id().unwrap_or_default()
                        );
                        continue;
                    } else {
                        log::debug!(
                            "Processing trace for user {}",
                            trace.user_id().unwrap_or_default()
                        );
                    }
                } else {
                    // Sampling factors failed to load — skip sampled triggers
                    // to avoid processing all traces unsampled (over-billing)
                    continue;
                }
            }

            // Filters matched - try to acquire lock to prevent duplicate triggers
            let lock_key = format!(
                "{}:{}:{}:{}",
                SIGNAL_TRIGGER_LOCK_CACHE_KEY,
                project_id,
                trigger.signal.id,
                trace.id(),
            );

            match cache.exists(&lock_key).await {
                Ok(true) => {
                    continue;
                }
                Ok(false) => {
                    // Lock doesn't exist, try to acquire it
                }
                Err(e) => {
                    log::warn!(
                        "[Signal trigger] Failed to check lock existence (key {}): {:?}",
                        lock_key,
                        e
                    );
                    // Continue to try acquiring lock
                }
            }

            // Try to acquire the lock
            let lock_acquired = match cache
                .try_acquire_lock(&lock_key, SIGNAL_TRIGGER_LOCK_TTL_SECONDS)
                .await
            {
                Ok(acquired) => acquired,
                Err(e) => {
                    // On lock error, still try to push (fail-open behavior)
                    log::error!(
                        "Failed to acquire lock for signal '{}' on trace {}: {:?}",
                        trigger.signal.name,
                        trace.id(),
                        e
                    );
                    true // Proceed anyway
                }
            };

            if !lock_acquired {
                // Lock was already held by another processor
                continue;
            }

            // Lock acquired - enqueue signal trigger run
            if let Err(e) = crate::signals::private::enqueue::enqueue_signal_trigger_run(
                trace.id(),
                trace.project_id(),
                trigger.id,
                trigger.signal.clone(),
                clickhouse.clone(),
                queue.clone(),
                trigger.mode.as_u8(),
            )
            .await
            {
                log::error!(
                    "Failed to enqueue signal trigger run: trace_id={}, project_id={}, trigger_id={}, signal={}, error={:?}",
                    trace.id(),
                    trace.project_id(),
                    trigger.id,
                    trigger.signal.name,
                    e
                );
            }
        }
    }
}
