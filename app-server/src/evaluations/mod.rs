use std::collections::HashMap;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use clickhouse::Row;

use crate::{
    ch::utils::chrono_to_nanoseconds,
    db::{
        evaluations::is_shared_evaluation,
        trace::{delete_shared_traces, insert_shared_traces},
    },
    utils::json_value_to_string,
};

/// Helper struct for fetching a single trace_id from ClickHouse.
#[derive(Row, serde::Serialize, serde::Deserialize)]
struct TraceIdRow {
    #[serde(with = "clickhouse::serde::uuid")]
    trace_id: Uuid,
}

pub const DEFAULT_GROUP_NAME: &str = "default";

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationDatapointDatasetLink {
    pub dataset_id: Uuid,
    pub datapoint_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationDatapointResult {
    pub data: Value,
    #[serde(default)]
    pub index: i32,
    #[serde(default = "Uuid::new_v4")]
    pub id: Uuid,
    #[serde(default)]
    pub target: Value,
    #[serde(default)]
    pub metadata: Option<HashMap<String, Value>>,
    #[serde(default)]
    pub executor_output: Option<Value>,
    #[serde(default)]
    pub trace_id: Uuid,
    #[serde(default)]
    pub scores: HashMap<String, Option<f64>>,
    #[serde(default)]
    pub dataset_link: Option<EvaluationDatapointDatasetLink>,
}

/// Check if a serde_json::Value is "falsey" for the purposes of not overwriting.
/// Falsey means: null, empty string, empty object, or empty array.
fn is_falsey_value(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::String(s) => s.is_empty(),
        Value::Object(o) => o.is_empty(),
        Value::Array(a) => a.is_empty(),
        _ => false,
    }
}

/// Convert a scores HashMap to a JSON string for ClickHouse.
/// Filters out null-valued scores so that jsonMergePatch (RFC 7396) does not
/// interpret them as deletions. Only scores with actual float values are included.
/// Returns "" if the scores map is empty or all values are None.
fn scores_to_json_string(scores: &HashMap<String, Option<f64>>) -> String {
    let filtered: HashMap<&String, f64> = scores
        .iter()
        .filter_map(|(k, v)| v.map(|val| (k, val)))
        .collect();
    if filtered.is_empty() {
        return String::new();
    }
    json_value_to_string(&serde_json::to_value(filtered).unwrap_or_default())
}

/// Convert a Value to a ClickHouse string, returning "" for falsey values.
fn value_to_ch_string(v: &Value) -> String {
    if is_falsey_value(v) {
        String::new()
    } else {
        json_value_to_string(v)
    }
}

/// Convert a metadata Option<HashMap> to a ClickHouse string.
/// Returns "" for None or empty maps so ClickHouse empty() can detect it.
fn metadata_to_ch_string(metadata: &Option<HashMap<String, Value>>) -> String {
    match metadata {
        Some(m) if !m.is_empty() => {
            json_value_to_string(&serde_json::to_value(m).unwrap_or_default())
        }
        _ => String::new(),
    }
}

pub async fn insert_evaluation_datapoints(
    pool: &PgPool,
    clickhouse: clickhouse::Client,
    evaluation_datapoints: Vec<EvaluationDatapointResult>,
    evaluation_id: Uuid,
    project_id: Uuid,
    group_name: &String,
) -> Result<()> {
    if evaluation_datapoints.is_empty() {
        return Ok(());
    }

    if is_shared_evaluation(pool, project_id, evaluation_id).await? {
        insert_shared_traces(
            pool,
            project_id,
            evaluation_datapoints
                .iter()
                .map(|dp| dp.trace_id)
                .collect::<Vec<_>>()
                .as_slice(),
        )
        .await?;
    }

    // Build a single INSERT...SELECT with UNION ALL for all datapoints.
    // Each datapoint becomes a row in the "new" subquery. A LEFT JOIN against the
    // existing table (with FINAL) lets ClickHouse decide per-column whether to keep
    // the existing value or use the new one, using empty() to detect falsey values.
    let now_nanos = chrono_to_nanoseconds(Utc::now());

    // Each row in the UNION ALL has 15 columns matching the new values.
    let row_sql = "SELECT toUUID(?) as id, toUUID(?) as evaluation_id, \
                   toUUID(?) as project_id, toUUID(?) as trace_id, \
                   fromUnixTimestamp64Nano(toInt64(?), 'UTC') as updated_at, \
                   ? as data, ? as target, ? as metadata, ? as executor_output, \
                   toUInt64(?) as `index`, toUUID(?) as dataset_id, \
                   toUUID(?) as dataset_datapoint_id, \
                   fromUnixTimestamp64Nano(toInt64(?), 'UTC') as dataset_datapoint_created_at, \
                   ? as group_id, ? as scores";

    let union_sql = vec![row_sql; evaluation_datapoints.len()].join(" UNION ALL ");

    let query = format!(
        "INSERT INTO evaluation_datapoints (
            id, evaluation_id, project_id, trace_id, updated_at,
            data, target, metadata, executor_output, `index`,
            dataset_id, dataset_datapoint_id, dataset_datapoint_created_at,
            group_id, scores
        )
        SELECT
            new.id,
            new.evaluation_id,
            new.project_id,
            if(existing.id IS NOT NULL AND empty(new.trace_id), existing.trace_id, new.trace_id),
            new.updated_at,
            if(existing.id IS NOT NULL AND empty(new.data), existing.data, new.data),
            if(existing.id IS NOT NULL AND empty(new.target), existing.target, new.target),
            if(existing.id IS NOT NULL AND empty(new.metadata), existing.metadata, new.metadata),
            if(existing.id IS NOT NULL AND empty(new.executor_output), existing.executor_output, new.executor_output),
            new.`index`,
            if(existing.id IS NOT NULL AND empty(new.dataset_id), existing.dataset_id, new.dataset_id),
            if(existing.id IS NOT NULL AND empty(new.dataset_id), existing.dataset_datapoint_id, new.dataset_datapoint_id),
            if(existing.id IS NOT NULL AND empty(new.dataset_id), existing.dataset_datapoint_created_at, new.dataset_datapoint_created_at),
            new.group_id,
            if(empty(new.scores),
                if(existing.id IS NOT NULL, existing.scores, new.scores),
                if(existing.id IS NOT NULL AND notEmpty(existing.scores),
                    jsonMergePatch(existing.scores, new.scores),
                    new.scores))
        FROM ({union_sql}) AS new
        LEFT JOIN (
            SELECT * FROM evaluation_datapoints FINAL
            WHERE project_id = toUUID(?) AND evaluation_id = toUUID(?)
        ) AS existing ON new.id = existing.id"
    );

    let mut q = clickhouse.query(&query);

    // Bind 15 params per datapoint (matching the UNION ALL row order)
    for dp in &evaluation_datapoints {
        let data = value_to_ch_string(&dp.data);
        let target = value_to_ch_string(&dp.target);
        let metadata = metadata_to_ch_string(&dp.metadata);
        let executor_output = dp
            .executor_output
            .as_ref()
            .map(|v| value_to_ch_string(v))
            .unwrap_or_default();
        let scores = scores_to_json_string(&dp.scores);

        let (dataset_id, dataset_datapoint_id, dataset_datapoint_created_at) =
            match &dp.dataset_link {
                Some(link) => (
                    link.dataset_id,
                    link.datapoint_id,
                    chrono_to_nanoseconds(link.created_at),
                ),
                None => (Uuid::nil(), Uuid::nil(), 0i64),
            };

        q = q.bind(dp.id);
        q = q.bind(evaluation_id);
        q = q.bind(project_id);
        q = q.bind(dp.trace_id);
        q = q.bind(now_nanos);
        q = q.bind(data.as_str());
        q = q.bind(target.as_str());
        q = q.bind(metadata.as_str());
        q = q.bind(executor_output.as_str());
        q = q.bind(dp.index as u64);
        q = q.bind(dataset_id);
        q = q.bind(dataset_datapoint_id);
        q = q.bind(dataset_datapoint_created_at);
        q = q.bind(group_name.as_str());
        q = q.bind(scores.as_str());
    }

    // WHERE clause for the existing rows subquery
    q = q.bind(project_id);
    q = q.bind(evaluation_id);

    q.execute().await.map_err(|e| {
        anyhow::anyhow!(
            "Clickhouse evaluation datapoints INSERT...SELECT failed: {:?}",
            e
        )
    })?;

    Ok(())
}

/// Update a single evaluation datapoint using INSERT...SELECT pattern.
/// Only updates trace_id, executor_output, and scores columns.
/// All other columns are preserved from the existing row.
pub async fn update_evaluation_datapoint(
    pool: &PgPool,
    clickhouse: clickhouse::Client,
    evaluation_id: Uuid,
    project_id: Uuid,
    datapoint_id: Uuid,
    group_id: &String,
    executor_output: Option<Value>,
    scores: HashMap<String, Option<f64>>,
    trace_id: Option<Uuid>,
) -> Result<()> {
    // Verify the datapoint exists and get its trace_id for shared evaluation handling.
    let existing_row = clickhouse
        .query(
            "SELECT trace_id FROM evaluation_datapoints FINAL
             WHERE project_id = ? AND evaluation_id = ? AND id = ?",
        )
        .bind(project_id)
        .bind(evaluation_id)
        .bind(datapoint_id)
        .fetch_optional::<TraceIdRow>()
        .await?;

    let existing_row =
        existing_row.ok_or_else(|| anyhow::anyhow!("Evaluation datapoint not found"))?;

    if is_shared_evaluation(pool, project_id, evaluation_id).await? {
        match trace_id {
            Some(new_trace_id) if !new_trace_id.is_nil() => {
                if new_trace_id != existing_row.trace_id {
                    delete_shared_traces(pool, project_id, &[existing_row.trace_id]).await?;
                    insert_shared_traces(pool, project_id, &[new_trace_id]).await?;
                }
            }
            _ => {
                // None or nil trace_id: re-mark existing trace as shared
                insert_shared_traces(pool, project_id, &[existing_row.trace_id]).await?;
            }
        }
    }

    let new_trace_id = trace_id.unwrap_or(Uuid::nil());
    let new_executor_output = executor_output
        .as_ref()
        .map(|v| value_to_ch_string(v))
        .unwrap_or_default();
    let new_scores = scores_to_json_string(&scores);
    let now_nanos = chrono_to_nanoseconds(Utc::now());

    // The existing row MUST exist (verified above). We SELECT from it and override
    // only the columns being updated. ClickHouse empty() detects falsey new values
    // (empty string, nil UUID) so the existing value is preserved.
    let query = "INSERT INTO evaluation_datapoints (
            id, evaluation_id, project_id, trace_id, updated_at,
            data, target, metadata, executor_output, `index`,
            dataset_id, dataset_datapoint_id, dataset_datapoint_created_at,
            group_id, scores
        )
        SELECT
            existing.id,
            existing.evaluation_id,
            existing.project_id,
            if(empty(toUUID(?)), existing.trace_id, toUUID(?)),
            fromUnixTimestamp64Nano(toInt64(?), 'UTC'),
            existing.data,
            existing.target,
            existing.metadata,
            if(empty(?), existing.executor_output, ?),
            existing.`index`,
            existing.dataset_id,
            existing.dataset_datapoint_id,
            existing.dataset_datapoint_created_at,
            ?,
            if(empty(?),
                existing.scores,
                if(notEmpty(existing.scores),
                    jsonMergePatch(existing.scores, ?),
                    ?))
        FROM (
            SELECT
                id,
                evaluation_id,
                project_id,
                trace_id,
                data,
                target,
                metadata,
                executor_output,
                `index`,
                scores,
                dataset_id,
                dataset_datapoint_id,
                dataset_datapoint_created_at,
                group_id
            FROM evaluation_datapoints FINAL
            WHERE project_id = ? AND evaluation_id = ? AND id = ?
        ) AS existing";

    clickhouse
        .query(query)
        .bind(new_trace_id)
        .bind(new_trace_id)
        .bind(now_nanos)
        .bind(new_executor_output.as_str())
        .bind(new_executor_output.as_str())
        .bind(group_id.as_str())
        .bind(new_scores.as_str())
        .bind(new_scores.as_str())
        .bind(new_scores.as_str())
        .bind(project_id)
        .bind(evaluation_id)
        .bind(datapoint_id)
        .execute()
        .await
        .map_err(|e| anyhow::anyhow!("Clickhouse evaluation datapoint update failed: {:?}", e))?;

    Ok(())
}
