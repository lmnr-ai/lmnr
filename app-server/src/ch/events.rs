use anyhow::Result;
use chrono::{DateTime, Utc};
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use serde_repr::Serialize_repr;
use uuid::Uuid;

use crate::db::{self, event_templates::EventTemplate};

use super::{
    modifiers::GroupByInterval,
    utils::{chrono_to_nanoseconds, TimeBounds},
};

#[derive(Debug, Serialize_repr)]
#[repr(u8)]
pub enum EventSource {
    CODE = 0,
    AUTO = 1,
    MANUAL = 2,
}

impl From<db::events::EventSource> for EventSource {
    fn from(source: db::events::EventSource) -> Self {
        match source {
            db::events::EventSource::CODE => EventSource::CODE,
            db::events::EventSource::AUTO => EventSource::AUTO,
            db::events::EventSource::MANUAL => EventSource::MANUAL,
        }
    }
}

#[derive(Debug, Serialize_repr)]
#[repr(u8)]
pub enum EventType {
    BOOLEAN = 0,
    NUMBER = 1,
    STRING = 2,
}

impl From<db::event_templates::EventType> for EventType {
    fn from(event_type: db::event_templates::EventType) -> Self {
        match event_type {
            db::event_templates::EventType::BOOLEAN => EventType::BOOLEAN,
            db::event_templates::EventType::NUMBER => EventType::NUMBER,
            db::event_templates::EventType::STRING => EventType::STRING,
        }
    }
}

#[derive(Row, Serialize)]
pub struct CHEvent {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    /// Timestamp in nanoseconds
    pub timestamp: i64,
    pub source: EventSource,
    #[serde(with = "clickhouse::serde::uuid")]
    pub template_id: Uuid,
    pub template_name: String,
    pub event_type: EventType,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
}

#[derive(Deserialize, Row, Serialize)]
pub struct IntMetricTimeValue {
    pub time: u32,
    pub value: i64,
}

impl CHEvent {
    pub fn from_data(
        id: Uuid,
        timestamp: DateTime<Utc>,
        event_template: EventTemplate,
        source: EventSource,
        project_id: Uuid,
    ) -> Self {
        CHEvent {
            id,
            timestamp: chrono_to_nanoseconds(timestamp),
            source,
            template_id: event_template.id,
            template_name: event_template.name,
            event_type: event_template.event_type.into(),
            project_id,
        }
    }
}

pub async fn insert_events(clickhouse: clickhouse::Client, events: Vec<CHEvent>) -> Result<()> {
    if events.is_empty() {
        return Ok(());
    }

    let ch_insert = clickhouse.insert("events");
    match ch_insert {
        Ok(mut ch_insert) => {
            for event in events {
                ch_insert.write(&event).await?;
            }
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => Err(anyhow::anyhow!(
                    "Clickhouse events insertion failed: {:?}",
                    e
                )),
            }
        }
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Failed to insert events into Clickhouse: {:?}",
                e
            ));
        }
    }
}

pub async fn get_time_bounds(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    template_id: Uuid,
) -> Result<TimeBounds> {
    let query_string = format!(
        "SELECT
            MIN(timestamp) AS min_time,
            MAX(timestamp) AS max_time
        FROM
            events
        WHERE project_id = '{}' AND template_id = '{}'",
        project_id, template_id
    );

    let mut cursor = clickhouse.query(&query_string).fetch::<TimeBounds>()?;

    let time_bounds = cursor.next().await?.unwrap();
    Ok(time_bounds)
}

pub async fn get_total_event_count_metrics_relative(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    template_id: Uuid,
    past_hours: i64,
) -> Result<Vec<IntMetricTimeValue>> {
    let ch_round_time = group_by_interval.to_ch_truncate_time();
    let ch_interval = group_by_interval.to_interval();
    let ch_step = group_by_interval.to_ch_step();

    let query_string = format!(
        "
    SELECT
        {}(timestamp) AS time,
        COUNT(DISTINCT id) AS value
    FROM events
    WHERE
        project_id = '{}'
        AND template_id = '{}'
        AND timestamp >= now() - INTERVAL {} HOUR
    GROUP BY
        time
    ORDER BY
        time
    WITH FILL
    FROM {}(NOW() - INTERVAL {} HOUR + INTERVAL {})
    TO {}(NOW() + INTERVAL {})
    STEP {}",
        ch_round_time,
        project_id,
        template_id,
        past_hours,
        ch_round_time,
        past_hours,
        ch_interval,
        ch_round_time,
        ch_interval,
        ch_step
    );

    let mut cursor = clickhouse
        .query(&query_string)
        .fetch::<IntMetricTimeValue>()?;

    let mut res = Vec::new();
    while let Some(row) = cursor.next().await? {
        res.push(row);
    }

    Ok(res)
}

pub async fn get_total_event_count_metrics_absolute(
    clickhouse: clickhouse::Client,
    group_by_interval: GroupByInterval,
    project_id: Uuid,
    template_id: Uuid,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
) -> Result<Vec<IntMetricTimeValue>> {
    let ch_round_time = group_by_interval.to_ch_truncate_time();
    let ch_step = group_by_interval.to_ch_step();
    let ch_start_time = start_time.timestamp();
    let ch_end_time = end_time.timestamp();

    let query_string = format!(
        "
    SELECT
        {}(timestamp) AS time,
        COUNT(DISTINCT id) AS value
    FROM events
    WHERE
        project_id = '{}'
        AND template_id = '{}'
        AND timestamp >= fromUnixTimestamp({})
        AND timestamp <= fromUnixTimestamp({})
    GROUP BY
        time
    ORDER BY
        time
    WITH FILL
    FROM {}(fromUnixTimestamp({}))
    TO {}(fromUnixTimestamp({}))
    STEP {}",
        ch_round_time,
        project_id,
        template_id,
        ch_start_time,
        ch_end_time,
        ch_round_time,
        ch_start_time,
        ch_round_time,
        ch_end_time,
        ch_step
    );

    let mut cursor = clickhouse
        .query(&query_string)
        .fetch::<IntMetricTimeValue>()?;

    let mut res = Vec::new();
    while let Some(row) = cursor.next().await? {
        res.push(row);
    }

    Ok(res)
}
