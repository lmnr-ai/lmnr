use std::sync::Arc;

use chrono::{Datelike, Timelike};
use sqlx::PgPool;

use crate::db::reports::get_all_reports;
use crate::mq::MessageQueue;

use super::{ReportTriggerMessage, push_to_reports_queue};

pub async fn run_reports_scheduler(pool: PgPool, queue: Arc<MessageQueue>) {
    loop {
        if let Err(e) = check_and_enqueue(&pool, queue.clone()).await {
            log::error!("[Reports Scheduler] Error: {:?}", e);
        }

        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        // TODO: Add smarter logic for next run
    }
}

async fn check_and_enqueue(pool: &PgPool, queue: Arc<MessageQueue>) -> anyhow::Result<()> {
    log::info!("[Reports Scheduler] Checking and enqueuing reports");
    return Ok(());
    let now = chrono::Utc::now();
    let weekday = now.weekday().num_days_from_monday() as i32; // 0 = Monday, 6 = Sunday
    let hour = now.hour() as i32;

    let reports = get_all_reports(pool).await?;

    // TODO: Add logic to filter reports in query
    for report in reports {
        if report.weekdays.contains(&weekday) && report.hour == hour {
            let message = ReportTriggerMessage {
                id: report.id,
                workspace_id: report.workspace_id,
                r#type: report.r#type,
                weekdays: report.weekdays,
                hour: report.hour,
            };

            if let Err(e) = push_to_reports_queue(message, queue.clone()).await {
                log::error!(
                    "[Reports Scheduler] Failed to enqueue report {}: {:?}",
                    report.id,
                    e
                );
            }
        }
    }

    Ok(())
}
