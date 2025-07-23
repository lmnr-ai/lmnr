use std::str::FromStr;
use std::collections::HashMap;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::traces::attributes::TraceAttributes;

#[derive(sqlx::Type, Deserialize, Serialize, PartialEq, Clone, Debug, Default)]
#[sqlx(type_name = "trace_type")]
pub enum TraceType {
    #[default]
    DEFAULT,
    EVENT,
    EVALUATION,
    PLAYGROUND,
}

impl FromStr for TraceType {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().trim() {
            "DEFAULT" => Ok(TraceType::DEFAULT),
            "EVENT" => Ok(TraceType::EVENT),
            "EVALUATION" => Ok(TraceType::EVALUATION),
            "PLAYGROUND" => Ok(TraceType::PLAYGROUND),
            _ => Err(anyhow::anyhow!("Invalid trace type: {}", s)),
        }
    }
}

#[derive(Serialize, sqlx::FromRow, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Trace {
    id: Uuid,
    #[serde(default)]
    start_time: Option<DateTime<Utc>>,
    #[serde(default)]
    end_time: Option<DateTime<Utc>>,
    session_id: Option<String>,
    metadata: Option<Value>,
    input_token_count: i64,
    output_token_count: i64,
    total_token_count: i64,
    input_cost: f64,
    output_cost: f64,
    cost: f64,
    project_id: Uuid,
    status: Option<String>,
}

pub async fn update_trace_attributes_batch(
    pool: &PgPool,
    trace_attributes_vec: &[TraceAttributes],
) -> Result<()> {
    if trace_attributes_vec.is_empty() {
        return Ok(());
    }

    let mut trace_aggregates: HashMap<Uuid, TraceAttributes> = HashMap::new();

    for attributes in trace_attributes_vec {
        let entry = trace_aggregates
            .entry(attributes.id)
            .or_insert_with(|| TraceAttributes {
                id: attributes.id,
                project_id: attributes.project_id,
                input_token_count: Some(0),
                output_token_count: Some(0),
                total_token_count: Some(0),
                input_cost: Some(0.0),
                output_cost: Some(0.0),
                cost: Some(0.0),
                start_time: attributes.start_time,
                end_time: attributes.end_time,
                session_id: attributes.session_id.clone(),
                trace_type: attributes.trace_type.clone(),
                metadata: attributes.metadata.clone(),
                has_browser_session: attributes.has_browser_session,
                top_span_id: attributes.top_span_id,
                status: attributes.status.clone(),
                user_id: attributes.user_id.clone(),
            });

        // Aggregate numeric values
        if let Some(input_tokens) = attributes.input_token_count {
            entry.input_token_count = Some(entry.input_token_count.unwrap_or(0) + input_tokens);
        }
        if let Some(output_tokens) = attributes.output_token_count {
            entry.output_token_count = Some(entry.output_token_count.unwrap_or(0) + output_tokens);
        }
        if let Some(total_tokens) = attributes.total_token_count {
            entry.total_token_count = Some(entry.total_token_count.unwrap_or(0) + total_tokens);
        }
        if let Some(input_cost) = attributes.input_cost {
            entry.input_cost = Some(entry.input_cost.unwrap_or(0.0) + input_cost);
        }
        if let Some(output_cost) = attributes.output_cost {
            entry.output_cost = Some(entry.output_cost.unwrap_or(0.0) + output_cost);
        }
        if let Some(cost) = attributes.cost {
            entry.cost = Some(entry.cost.unwrap_or(0.0) + cost);
        }

        // Take earliest start time and latest end time
        if let Some(start_time) = attributes.start_time {
            entry.start_time = Some(
                entry
                    .start_time
                    .map_or(start_time, |existing| existing.min(start_time)),
            );
        }
        if let Some(end_time) = attributes.end_time {
            entry.end_time = Some(
                entry
                    .end_time
                    .map_or(end_time, |existing| existing.max(end_time)),
            );
        }

        // Override with non-null values
        if attributes.session_id.is_some() {
            entry.session_id = attributes.session_id.clone();
        }
        if attributes.trace_type.is_some() {
            entry.trace_type = attributes.trace_type.clone();
        }
        if attributes.metadata.is_some() {
            entry.metadata = attributes.metadata.clone();
        }
        if attributes.has_browser_session == Some(true) {
            entry.has_browser_session = attributes.has_browser_session;
        }
        if entry.top_span_id.is_none() && attributes.top_span_id.is_some() {
            entry.top_span_id = attributes.top_span_id;
        }
        if attributes.status.is_some() {
            // Error status takes precedence
            if attributes.status == Some("error".to_string()) || entry.status.is_none() {
                entry.status = attributes.status.clone();
            }
        }
        if attributes.user_id.is_some() {
            entry.user_id = attributes.user_id.clone();
        }
    }

    // Insert aggregated traces, using the project_id from the first span in each trace
    for (_, attributes) in trace_aggregates {
        let metadata_value = attributes
            .metadata
            .as_ref()
            .and_then(|m| serde_json::to_value(m).ok());

        sqlx::query(
            "
            INSERT INTO traces (
                id,
                project_id,
                input_token_count,
                output_token_count,
                total_token_count,
                input_cost,
                output_cost,
                cost,
                start_time,
                end_time,
                session_id,
                trace_type,
                metadata,
                has_browser_session,
                top_span_id,
                status,
                user_id
            )
            VALUES (
                $1,
                $2,
                COALESCE($3, 0::int8),
                COALESCE($4, 0::int8),
                COALESCE($5, 0::int8),
                COALESCE($6, 0::float8),
                COALESCE($7, 0::float8),
                COALESCE($8, 0::float8),
                $9,
                $10,
                $11,
                COALESCE($12, 'DEFAULT'::trace_type),
                $13,
                $14,
                $15,
                $16,
                $17
            )
            ON CONFLICT(id) DO
            UPDATE
            SET
                input_token_count = traces.input_token_count + COALESCE($3, 0),
                output_token_count = traces.output_token_count + COALESCE($4, 0),
                total_token_count = traces.total_token_count + COALESCE($5, 0),
                input_cost = traces.input_cost + COALESCE($6, 0),
                output_cost = traces.output_cost + COALESCE($7, 0),
                cost = traces.cost + COALESCE($8, 0),
                start_time = CASE WHEN traces.start_time IS NULL OR traces.start_time > $9 THEN $9 ELSE traces.start_time END,
                end_time = CASE WHEN traces.end_time IS NULL OR traces.end_time < $10 THEN $10 ELSE traces.end_time END,
                session_id = COALESCE($11, traces.session_id),
                trace_type = COALESCE($12, traces.trace_type),
                metadata = COALESCE($13, traces.metadata),
                has_browser_session = COALESCE($14, traces.has_browser_session),
                top_span_id = COALESCE(traces.top_span_id, $15),
                status = CASE WHEN $16 = 'error' THEN $16 ELSE COALESCE($16, traces.status) END,
                user_id = COALESCE($17, traces.user_id)
            "
        )
        .bind(attributes.id)
        .bind(attributes.project_id)
        .bind(attributes.input_token_count)
        .bind(attributes.output_token_count)
        .bind(attributes.total_token_count)
        .bind(attributes.input_cost)
        .bind(attributes.output_cost)
        .bind(attributes.cost)
        .bind(attributes.start_time)
        .bind(attributes.end_time)
        .bind(&attributes.session_id)
        .bind(&attributes.trace_type)
        .bind(&metadata_value)
        .bind(attributes.has_browser_session)
        .bind(attributes.top_span_id)
        .bind(&attributes.status)
        .bind(&attributes.user_id)
        .execute(pool)
        .await?;
    }

    Ok(())
}

/// Set the trace_type for a specific trace (creates trace if it doesn't exist)
pub async fn update_trace_type(
    pool: &PgPool,
    project_id: &Uuid,
    trace_id: Uuid,
    trace_type: TraceType,
) -> Result<()> {
    // Use upsert pattern - create trace with EVALUATION type if it doesn't exist,
    // or update existing trace to EVALUATION type
    sqlx::query(
        "INSERT INTO traces (id, project_id, trace_type, input_token_count, output_token_count, total_token_count, input_cost, output_cost, cost)
         VALUES ($1, $2, $3, 0, 0, 0, 0.0, 0.0, 0.0)
         ON CONFLICT(id) DO UPDATE
         SET trace_type = $3"
    )
    .bind(trace_id)
    .bind(project_id)
    .bind(trace_type)
    .execute(pool)
    .await?;

    Ok(())
}

    pub async fn get_trace(
        pool: &PgPool,
        project_id: &Uuid,
        trace_id: &Uuid,
    ) -> Result<Option<Trace>, sqlx::Error> {
        sqlx::query_as::<_, Trace>(
            "SELECT 
                t.id, 
                t.start_time, 
                t.end_time, 
                t.session_id,
                t.input_token_count, 
                t.output_token_count, 
                t.total_token_count,
                t.input_cost, 
                t.output_cost, 
                t.cost, 
                t.trace_type, 
                t.status,
                CASE
                    WHEN t.start_time IS NOT NULL AND t.end_time IS NOT NULL 
                    THEN CAST(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) * 1000 AS FLOAT8)
                    ELSE NULL 
                END as latency,
                t.metadata,
                t.project_id
            FROM traces t
            WHERE t.id = $1 AND t.project_id = $2"
        )
        .bind(trace_id)
        .bind(project_id)
        .fetch_optional(pool)
        .await
    }