use anyhow::Result;
use chrono::{DateTime, Months, Utc};
use clickhouse::Client;
use uuid::Uuid;

/// Calculate how many complete months have elapsed from start_date to end_date
/// This mimics Python's dateutil.relativedelta behavior
fn complete_months_elapsed(start_date: DateTime<Utc>, end_date: DateTime<Utc>) -> u32 {
    let mut months_elapsed = 0u32;

    // Always add months to the original start_date to avoid accumulating errors
    while let Some(next_month_date) = start_date.checked_add_months(Months::new(months_elapsed + 1))
    {
        if next_month_date <= end_date {
            months_elapsed += 1;
        } else {
            break;
        }
    }

    months_elapsed
}

pub async fn get_workspace_bytes_ingested_by_project_ids(
    clickhouse: Client,
    project_ids: Vec<Uuid>,
    reset_time: DateTime<Utc>,
) -> Result<usize> {
    let now = Utc::now();
    let months_elapsed = complete_months_elapsed(reset_time, now);

    let latest_reset_time = if months_elapsed > 0 {
        // Unwrap is safe, because the date is unlikely to be out of range
        // and we are using UTC, so DST is not an issue
        reset_time
            .checked_add_months(Months::new(months_elapsed))
            .unwrap_or(reset_time)
    } else {
        reset_time
    };

    let query = "WITH spans_bytes_ingested AS (
      SELECT
        SUM(spans.size_bytes) as spans_bytes_ingested
      FROM spans
      WHERE project_id IN { project_ids: Array(UUID) }
      AND spans.start_time >= { latest_reset_time: DateTime(6) }
    ),
    browser_session_events_bytes_ingested AS (
      SELECT
        SUM(browser_session_events.size_bytes) as browser_session_events_bytes_ingested
      FROM browser_session_events
      WHERE project_id IN { project_ids: Array(UUID) }
      AND browser_session_events.timestamp >= { latest_reset_time: DateTime(6) }
    ),
    SELECT
      spans_bytes_ingested + browser_session_events_bytes_ingested as total_bytes_ingested
    FROM spans_bytes_ingested, browser_session_events_bytes_ingested
    ";

    let result = clickhouse
        .query(&query)
        .param("project_ids", project_ids)
        .param("latest_reset_time", latest_reset_time.naive_utc())
        .fetch_optional::<usize>()
        .await?;

    Ok(result.unwrap_or(0))
}

pub async fn get_workspace_signal_runs_by_project_ids(
    clickhouse: Client,
    project_ids: Vec<Uuid>,
    reset_time: DateTime<Utc>,
) -> Result<usize> {
    let now = Utc::now();
    let months_elapsed = complete_months_elapsed(reset_time, now);

    let latest_reset_time = if months_elapsed > 0 {
        // Unwrap is safe, because the date is unlikely to be out of range
        // and we are using UTC, so DST is not an issue
        reset_time
            .checked_add_months(Months::new(months_elapsed))
            .unwrap_or(reset_time)
    } else {
        reset_time
    };

    let query = "
    SELECT
      COUNT(*) as total_signal_runs
    FROM signal_runs
    WHERE project_id IN { project_ids: Array(UUID) }
    AND signal_runs.updated_at >= { latest_reset_time: DateTime(6) }
    -- Only count completed signal runs
    AND signal_runs.status = 1
    ";

    let result = clickhouse
        .query(&query)
        .param("project_ids", project_ids)
        .param("latest_reset_time", latest_reset_time.naive_utc())
        .fetch_optional::<usize>()
        .await?;

    Ok(result.unwrap_or(0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_complete_months_elapsed_same_day() {
        let start = Utc.with_ymd_and_hms(2025, 1, 15, 12, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2025, 3, 15, 12, 0, 0).unwrap();
        assert_eq!(complete_months_elapsed(start, end), 2);
    }

    #[test]
    fn test_complete_months_elapsed_incomplete_month() {
        let start = Utc.with_ymd_and_hms(2025, 6, 30, 12, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2025, 7, 30, 11, 59, 59).unwrap();
        assert_eq!(complete_months_elapsed(start, end), 0);
    }

    #[test]
    fn test_complete_months_elapsed_month_end_to_month_end() {
        let start = Utc.with_ymd_and_hms(2025, 1, 31, 0, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2025, 2, 28, 0, 0, 0).unwrap();
        assert_eq!(complete_months_elapsed(start, end), 1);
    }

    #[test]
    fn test_complete_months_elapsed_month_end_before_complete() {
        let start = Utc.with_ymd_and_hms(2025, 1, 31, 0, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2025, 2, 27, 0, 0, 0).unwrap();
        assert_eq!(complete_months_elapsed(start, end), 0);
    }

    #[test]
    fn test_complete_months_elapsed_month_end_of_february() {
        let start = Utc.with_ymd_and_hms(2025, 1, 31, 12, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2025, 2, 28, 12, 0, 0).unwrap();
        assert_eq!(complete_months_elapsed(start, end), 1);
    }

    #[test]
    fn test_complete_months_elapsed_across_february() {
        let start = Utc.with_ymd_and_hms(2025, 1, 31, 0, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2025, 4, 29, 0, 0, 0).unwrap();
        assert_eq!(complete_months_elapsed(start, end), 2);
    }

    #[test]
    fn test_complete_months_elapsed_leap_year() {
        let start = Utc.with_ymd_and_hms(2024, 1, 31, 12, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2024, 2, 29, 12, 0, 0).unwrap();
        assert_eq!(complete_months_elapsed(start, end), 1);
    }

    #[test]
    fn test_complete_months_elapsed_month_28th_of_february_leap_year() {
        let start = Utc.with_ymd_and_hms(2024, 1, 31, 12, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2024, 2, 28, 12, 0, 0).unwrap();
        assert_eq!(complete_months_elapsed(start, end), 0);
    }

    #[test]
    fn test_complete_months_elapsed_no_time_passed() {
        let start = Utc.with_ymd_and_hms(2025, 5, 15, 12, 0, 0).unwrap();
        let end = start;
        assert_eq!(complete_months_elapsed(start, end), 0);
    }

    #[test]
    fn test_complete_months_elapsed_year_boundary() {
        let start = Utc.with_ymd_and_hms(2024, 11, 30, 0, 0, 0).unwrap();
        let end = Utc.with_ymd_and_hms(2025, 1, 30, 0, 0, 0).unwrap();
        assert_eq!(complete_months_elapsed(start, end), 2);
    }
}
