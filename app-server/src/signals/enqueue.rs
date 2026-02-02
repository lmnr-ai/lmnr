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

/// Creates a signal run, emits internal tracing span, and enqueues to the signals queue.
/// Returns the SignalRun (potentially marked as failed if queue push fails).
async fn create_and_enqueue_signal_run(
    trace_id: Uuid,
    project_id: Uuid,
    signal: &Signal,
    job_id: Uuid,
    trigger_id: Uuid,
    queue: Arc<MessageQueue>,
) -> super::SignalRun {
    // get internal project id for tracing
    let internal_project_id: Option<Uuid> = env::var("SIGNAL_JOB_INTERNAL_PROJECT_ID")
        .ok()
        .and_then(|s| s.parse().ok());

    let run_id = Uuid::new_v4();
    let internal_trace_id = Uuid::new_v4();

    // Determine if this is a job-based or trigger-based run
    let is_job_run = job_id != Uuid::nil();
    let is_trigger_run = trigger_id != Uuid::nil();

    // Build input map based on run type
    let mut input_map: HashMap<String, Uuid> = HashMap::from([
        ("run_id".to_string(), run_id),
        ("trace_id".to_string(), trace_id),
        ("signal_id".to_string(), signal.id),
    ]);
    if is_job_run {
        input_map.insert("job_id".to_string(), job_id);
    }
    if is_trigger_run {
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
            job_ids: if is_job_run { vec![job_id] } else { vec![] },
        },
    )
    .await;

    let mut signal_run = super::SignalRun {
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
        trigger_id: if is_trigger_run {
            Some(trigger_id)
        } else {
            None
        },
        signal: signal.clone(),
        run_metadata: super::queue::SignalRunMetadata {
            run_id,
            internal_trace_id,
            internal_span_id,
            job_id,
            step: 0,
        },
    };

    if push_to_signals_queue(message, queue.clone()).await.is_err() {
        signal_run = signal_run.failed("Failed to push to signals queue");
    }

    signal_run
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

    let mut signal_runs: Vec<super::SignalRun> = Vec::with_capacity(trace_ids.len());
    for trace_id in trace_ids {
        let signal_run = create_and_enqueue_signal_run(
            trace_id,
            project_id,
            &signal,
            job.id,
            Uuid::nil(), // No trigger for job-based runs
            queue.clone(),
        )
        .await;

        signal_runs.push(signal_run);
    }

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
    let signal_run = create_and_enqueue_signal_run(
        trace_id,
        project_id,
        &signal,
        Uuid::nil(), // No job for trigger-based runs
        trigger_id,
        queue.clone(),
    )
    .await;

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

    log::debug!(
        "Enqueued trigger-based signal run: run_id={}, trace_id={}, trigger_id={}, signal={}",
        signal_run.run_id,
        trace_id,
        trigger_id,
        signal.name
    );

    Ok(())
}
