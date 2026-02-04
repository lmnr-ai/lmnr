use std::{collections::HashMap, env, sync::Arc};

use chrono::Utc;
use uuid::Uuid;

use crate::ch::signal_runs::insert_signal_runs;
use crate::db::DB;
use crate::db::signals::Signal;
use crate::mq::MessageQueue;
use crate::routes::signals::SubmitSignalJobResponse;
use crate::signals::queue::SignalMessage;
use crate::signals::utils::{InternalSpan, emit_internal_span};
use crate::signals::{LLM_MODEL, LLM_PROVIDER, push_to_signals_queue};

/// Creates a signal run and message, emits internal tracing span.
/// Does NOT push to queue yet - caller is responsible for pushing after ClickHouse insert.
/// Returns the SignalRun and SignalMessage.
async fn create_signal_run_and_message(
    trace_id: Uuid,
    project_id: Uuid,
    signal: &Signal,
    job_id: Option<Uuid>,
    trigger_id: Option<Uuid>,
    queue: Arc<MessageQueue>,
) -> (super::SignalRun, SignalMessage) {
    // get internal project id for tracing
    let internal_project_id: Option<Uuid> = env::var("SIGNAL_JOB_INTERNAL_PROJECT_ID")
        .ok()
        .and_then(|s| s.parse().ok());

    let run_id = Uuid::new_v4();
    let internal_trace_id = Uuid::new_v4();

    // Build input map based on run type
    let mut input_map: HashMap<String, Uuid> = HashMap::from([
        ("run_id".to_string(), run_id),
        ("trace_id".to_string(), trace_id),
        ("signal_id".to_string(), signal.id),
    ]);
    if let Some(job_id) = job_id {
        input_map.insert("job_id".to_string(), job_id);
    }
    if let Some(trigger_id) = trigger_id {
        input_map.insert("trigger_id".to_string(), trigger_id);
    }
    let input = serde_json::to_value(input_map).unwrap();

    // Emit root span for internal tracing of a run
    let internal_span_id = emit_internal_span(
        queue.clone(),
        InternalSpan {
            name: "signal.run".to_string(),
            trace_id: internal_trace_id,
            run_id,
            signal_name: signal.name.clone(),
            parent_span_id: None,
            span_type: crate::db::spans::SpanType::Default,
            start_time: chrono::Utc::now(),
            input: Some(input),
            output: None,
            input_tokens: None,
            output_tokens: None,
            model: LLM_MODEL.clone(),
            provider: LLM_PROVIDER.clone(),
            internal_project_id,
            job_id,
            error: None,
            provider_batch_id: None,
        },
    )
    .await;

    let signal_run = super::SignalRun {
        run_id,
        project_id,
        job_id,
        trigger_id,
        signal_id: signal.id,
        trace_id,
        step: 0,
        status: super::RunStatus::Pending,
        internal_trace_id,
        internal_span_id,
        updated_at: Utc::now(),
        event_id: None,
        error_message: None,
    };

    let message = SignalMessage {
        trace_id,
        project_id,
        trigger_id,
        signal: signal.clone(),
        run_id,
        internal_trace_id,
        internal_span_id,
        job_id,
        step: 0,
        retry_count: 0,
    };

    (signal_run, message)
}

/// Flatten the job runs and push it to the queue, so that only BatchMessageHandler
/// is responsible for batching
pub async fn enqueue_signal_job(
    project_id: Uuid,
    signal: Signal,
    db: Arc<DB>,
    trace_ids: Vec<Uuid>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<SubmitSignalJobResponse> {
    let total_traces: i32 = trace_ids.len() as i32;

    let job =
        crate::db::signal_jobs::create_signal_job(&db.pool, signal.id, project_id, total_traces)
            .await
            .map_err(|e| {
                log::error!("Failed to create signal job: {:?}", e);
                anyhow::anyhow!("Failed to create signal job")
            })?;

    // Step 1: Create all runs and messages (without pushing to queue yet)
    let mut signal_runs: Vec<super::SignalRun> = Vec::with_capacity(trace_ids.len());
    let mut messages: Vec<SignalMessage> = Vec::with_capacity(trace_ids.len());

    for trace_id in trace_ids {
        let (signal_run, message) = create_signal_run_and_message(
            trace_id,
            project_id,
            &signal,
            Some(job.id),
            None,
            queue.clone(),
        )
        .await;

        signal_runs.push(signal_run);
        messages.push(message);
    }

    // Step 2: Insert all runs into ClickHouse before pushing to queue
    let ch_runs: Vec<crate::ch::signal_runs::CHSignalRun> = signal_runs
        .iter()
        .map(crate::ch::signal_runs::CHSignalRun::from)
        .collect();

    insert_signal_runs(clickhouse.clone(), &ch_runs)
        .await
        .map_err(|e| {
            log::error!("Failed to insert signal runs: {:?}", e);
            anyhow::anyhow!("Failed to insert signal runs")
        })?;

    // Step 3: Now that ClickHouse insert succeeded, push messages to queue
    // Track which runs fail during queue push
    let mut failed_count = 0i32;

    for (idx, message) in messages.into_iter().enumerate() {
        if push_to_signals_queue(message, queue.clone()).await.is_err() {
            // Mark the corresponding run as failed
            signal_runs[idx] = signal_runs[idx]
                .clone()
                .failed("Failed to push to signals queue");
            failed_count += 1;
        }
    }

    // Step 4: If any runs failed during queue push, update them in ClickHouse and update job stats
    if failed_count > 0 {
        let failed_ch_runs: Vec<crate::ch::signal_runs::CHSignalRun> = signal_runs
            .iter()
            .filter(|run| run.status == super::RunStatus::Failed)
            .map(crate::ch::signal_runs::CHSignalRun::from)
            .collect();

        // Update failed runs in ClickHouse
        insert_signal_runs(clickhouse.clone(), &failed_ch_runs)
            .await
            .map_err(|e| {
                log::error!("Failed to update failed signal runs in ClickHouse: {:?}", e);
                anyhow::anyhow!("Failed to update failed signal runs")
            })?;

        // Update job statistics
        crate::db::signal_jobs::update_signal_job_stats(&db.pool, job.id, 0, failed_count)
            .await
            .map_err(|e| {
                log::error!(
                    "Failed to update job statistics for queue push failures: job_id={}, failed_count={}, error={:?}",
                    job.id,
                    failed_count,
                    e
                );
                anyhow::anyhow!("Failed to update job statistics")
            })?;
    }

    let response = SubmitSignalJobResponse {
        job_id: job.id,
        total_traces: job.total_traces,
        signal_id: job.signal_id,
    };

    Ok(response)
}

/// Enqueue a single signal run triggered by a trace matching a trigger condition.
/// Unlike job-based runs, trigger-based runs have no job_id (set to Uuid::nil()).
pub async fn enqueue_signal_trigger_run(
    trace_id: Uuid,
    project_id: Uuid,
    trigger_id: Uuid,
    signal: Signal,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    // Step 1: Create run and message (without pushing to queue yet)
    let (signal_run, message) = create_signal_run_and_message(
        trace_id,
        project_id,
        &signal,
        None,
        Some(trigger_id),
        queue.clone(),
    )
    .await;

    // Step 2: Insert runs into ClickHouse first
    let ch_runs = vec![crate::ch::signal_runs::CHSignalRun::from(&signal_run)];

    insert_signal_runs(clickhouse.clone(), &ch_runs)
        .await
        .map_err(|e| {
            log::error!(
                "Failed to insert signal run: trace_id={}, trigger_id={}, error={:?}",
                trace_id,
                trigger_id,
                e
            );
            anyhow::anyhow!("Failed to insert signal run")
        })?;

    // Step 3: Now that ClickHouse insert succeeded, push to queue
    if let Err(e) = push_to_signals_queue(message, queue.clone()).await {
        log::error!(
            "Failed to push signal run to queue: run_id={}, trace_id={}, trigger_id={}, error={:?}",
            signal_run.run_id,
            trace_id,
            trigger_id,
            e
        );

        // Mark run as failed and update in ClickHouse
        let failed_run = signal_run.failed("Failed to push to signals queue");
        let failed_ch_runs = vec![crate::ch::signal_runs::CHSignalRun::from(&failed_run)];

        insert_signal_runs(clickhouse.clone(), &failed_ch_runs)
            .await
            .map_err(|e| {
                log::error!(
                    "Failed to update failed signal run in ClickHouse: run_id={}, error={:?}",
                    failed_run.run_id,
                    e
                );
                anyhow::anyhow!("Failed to update failed signal run")
            })?;

        return Err(anyhow::anyhow!("Failed to push signal run to queue"));
    }

    log::debug!(
        "Enqueued trigger-based signal run: run_id={}, trace_id={}, trigger_id={}, signal={}",
        signal_run.run_id,
        trace_id,
        trigger_id,
        signal.name
    );

    Ok(())
}
