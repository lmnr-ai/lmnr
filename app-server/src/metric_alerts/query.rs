//! ClickHouse reads for metric rules. Every due rule of a project shares one
//! scan of the span rollup.

use anyhow::Result;
use uuid::Uuid;

use crate::ch::span_metrics::{MinuteRange, get_span_metrics};

use super::series::{Minutes, Series, merge_ranges};

/// Reads the rollup over `ranges` for one project.
pub async fn fetch_series(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    ranges: Vec<Minutes>,
) -> Result<Series> {
    let ranges: Vec<MinuteRange> = merge_ranges(ranges)
        .into_iter()
        .map(|range| MinuteRange {
            start: range.start * 60,
            end: range.end * 60,
        })
        .collect();
    let rows = get_span_metrics(clickhouse, project_id, &ranges).await?;

    let mut series = Series::default();
    series.add_rows(&rows);
    Ok(series)
}
