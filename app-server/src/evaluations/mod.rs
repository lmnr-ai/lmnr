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
fn scores_to_json_string(scores: &HashMap<String, Option<f64>>) -> String {
    let filtered: HashMap<&String, f64> = scores
        .iter()
        .filter_map(|(k, v)| v.map(|val| (k, val)))
        .collect();
    json_value_to_string(&serde_json::to_value(filtered).unwrap_or_default())
}

/// Convert a metadata Option<HashMap> to a JSON string for ClickHouse.
fn metadata_to_json_string(metadata: &Option<HashMap<String, Value>>) -> String {
    match metadata {
        Some(m) => json_value_to_string(
            &serde_json::to_value(m).unwrap_or_default(),
        ),
        None => "{}".to_string(),
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

    for dp in &evaluation_datapoints {
        let new_data = json_value_to_string(&dp.data);
        let new_target = json_value_to_string(&dp.target);
        let new_metadata = metadata_to_json_string(&dp.metadata);
        let new_executor_output = dp
            .executor_output
            .as_ref()
            .map(|v| json_value_to_string(v))
            .unwrap_or_default();
        let new_scores = scores_to_json_string(&dp.scores);

        let data_is_falsey = is_falsey_value(&dp.data);
        let target_is_falsey = is_falsey_value(&dp.target);
        let metadata_is_falsey = dp.metadata.is_none()
            || dp.metadata.as_ref().is_some_and(|m| m.is_empty());
        let executor_output_is_falsey = dp.executor_output.is_none()
            || dp
                .executor_output
                .as_ref()
                .is_some_and(|v| is_falsey_value(v));
        let trace_id_is_falsey = dp.trace_id.is_nil();
        let scores_is_empty = dp.scores.is_empty()
            || dp.scores.values().all(|v| v.is_none());

        let (dataset_id, dataset_datapoint_id, dataset_datapoint_created_at) =
            match &dp.dataset_link {
                Some(link) => (
                    link.dataset_id,
                    link.datapoint_id,
                    chrono_to_nanoseconds(link.created_at),
                ),
                None => (Uuid::nil(), Uuid::nil(), 0i64),
            };
        let dataset_link_is_falsey = dp.dataset_link.is_none();

        let now_nanos = chrono_to_nanoseconds(Utc::now());

        // Build the INSERT ... SELECT query.
        // The subselect uses FINAL to get the latest version of the existing row.
        // If the row doesn't exist, the LEFT JOIN produces NULLs and we use the new values.
        // For each column: if the new value is "falsey", keep the existing value; otherwise use the new value.
        // For scores: use jsonMergePatch to merge existing and new scores (only when new scores are non-empty).
        let query = format!(
            "INSERT INTO evaluation_datapoints (
                id, evaluation_id, project_id, trace_id, updated_at,
                data, target, metadata, executor_output, `index`,
                dataset_id, dataset_datapoint_id, dataset_datapoint_created_at,
                group_id, scores
            )
            SELECT
                toUUID(?) as new_id,
                toUUID(?) as new_evaluation_id,
                toUUID(?) as new_project_id,
                {} as final_trace_id,
                fromUnixTimestamp64Nano(toInt64(?), 'UTC') as new_updated_at,
                {} as final_data,
                {} as final_target,
                {} as final_metadata,
                {} as final_executor_output,
                toUInt64(?) as new_index,
                {} as final_dataset_id,
                {} as final_dataset_datapoint_id,
                {} as final_dataset_datapoint_created_at,
                ? as new_group_id,
                {} as final_scores
            FROM (SELECT 1 as _dummy) AS _base
            LEFT JOIN (
                SELECT *
                FROM evaluation_datapoints FINAL
                WHERE project_id = toUUID(?)
                  AND evaluation_id = toUUID(?)
                  AND id = toUUID(?)
            ) AS existing ON 1 = 1",
            // trace_id
            if trace_id_is_falsey {
                "if(existing.id IS NOT NULL, existing.trace_id, toUUID(?))".to_string()
            } else {
                "toUUID(?)".to_string()
            },
            // data
            if data_is_falsey {
                "if(existing.id IS NOT NULL, existing.data, ?)".to_string()
            } else {
                "?".to_string()
            },
            // target
            if target_is_falsey {
                "if(existing.id IS NOT NULL, existing.target, ?)".to_string()
            } else {
                "?".to_string()
            },
            // metadata
            if metadata_is_falsey {
                "if(existing.id IS NOT NULL, existing.metadata, ?)".to_string()
            } else {
                "?".to_string()
            },
            // executor_output
            if executor_output_is_falsey {
                "if(existing.id IS NOT NULL, existing.executor_output, ?)".to_string()
            } else {
                "?".to_string()
            },
            // dataset_id
            if dataset_link_is_falsey {
                "if(existing.id IS NOT NULL, existing.dataset_id, toUUID(?))".to_string()
            } else {
                "toUUID(?)".to_string()
            },
            // dataset_datapoint_id
            if dataset_link_is_falsey {
                "if(existing.id IS NOT NULL, existing.dataset_datapoint_id, toUUID(?))".to_string()
            } else {
                "toUUID(?)".to_string()
            },
            // dataset_datapoint_created_at
            if dataset_link_is_falsey {
                "if(existing.id IS NOT NULL, existing.dataset_datapoint_created_at, fromUnixTimestamp64Nano(toInt64(?), 'UTC'))".to_string()
            } else {
                "fromUnixTimestamp64Nano(toInt64(?), 'UTC')".to_string()
            },
            // scores
            if scores_is_empty {
                "if(existing.id IS NOT NULL, existing.scores, ?)".to_string()
            } else {
                "if(existing.id IS NOT NULL AND existing.scores != '', jsonMergePatch(existing.scores, ?), ?)".to_string()
            },
        );

        let mut q = clickhouse.query(&query);

        // Bind parameters in order they appear in the query:
        // 1. new_id
        q = q.bind(dp.id);
        // 2. new_evaluation_id
        q = q.bind(evaluation_id);
        // 3. new_project_id
        q = q.bind(project_id);
        // 4. trace_id (always one bind)
        q = q.bind(dp.trace_id);
        // 5. new_updated_at
        q = q.bind(now_nanos);
        // 6. data (always one bind)
        q = q.bind(new_data.as_str());
        // 7. target (always one bind)
        q = q.bind(new_target.as_str());
        // 8. metadata (always one bind)
        q = q.bind(new_metadata.as_str());
        // 9. executor_output (always one bind)
        q = q.bind(new_executor_output.as_str());
        // 10. index
        q = q.bind(dp.index as u64);
        // 11. dataset_id (always one bind)
        q = q.bind(dataset_id);
        // 12. dataset_datapoint_id (always one bind)
        q = q.bind(dataset_datapoint_id);
        // 13. dataset_datapoint_created_at (always one bind)
        q = q.bind(dataset_datapoint_created_at);
        // 14. group_id
        q = q.bind(group_name.as_str());
        // 15. scores: if empty -> 1 bind, if non-empty -> 2 binds (existing merge + new)
        if scores_is_empty {
            q = q.bind(new_scores.as_str());
        } else {
            q = q.bind(new_scores.as_str());
            q = q.bind(new_scores.as_str());
        }
        // 16-18. WHERE clause for existing subselect
        q = q.bind(project_id);
        q = q.bind(evaluation_id);
        q = q.bind(dp.id);

        q.execute().await.map_err(|e| {
            anyhow::anyhow!(
                "Clickhouse evaluation datapoint INSERT...SELECT failed: {:?}",
                e
            )
        })?;
    }

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

    let existing_row = existing_row
        .ok_or_else(|| anyhow::anyhow!("Evaluation datapoint not found"))?;

    if is_shared_evaluation(pool, project_id, evaluation_id).await? {
        if let Some(new_trace_id) = trace_id {
            if new_trace_id != existing_row.trace_id {
                delete_shared_traces(pool, project_id, &[existing_row.trace_id]).await?;
                insert_shared_traces(pool, project_id, &[new_trace_id]).await?;
            }
        } else {
            // Re-mark existing trace as shared in case it wasn't during creation
            insert_shared_traces(pool, project_id, &[existing_row.trace_id]).await?;
        }
    }

    let new_executor_output = executor_output
        .as_ref()
        .map(|v| json_value_to_string(v))
        .unwrap_or_default();
    let new_scores = scores_to_json_string(&scores);

    let executor_output_is_falsey = executor_output.is_none()
        || executor_output.as_ref().is_some_and(|v| is_falsey_value(v));
    let trace_id_is_falsey = trace_id.is_none() || trace_id.is_some_and(|id| id.is_nil());
    let scores_is_empty = scores.is_empty()
        || scores.values().all(|v| v.is_none());

    let now_nanos = chrono_to_nanoseconds(Utc::now());

    // For update_evaluation_datapoint, the existing row MUST exist.
    // We preserve all columns from the existing row except the ones being updated.
    let query = format!(
        "INSERT INTO evaluation_datapoints (
            id, evaluation_id, project_id, trace_id, updated_at,
            data, target, metadata, executor_output, `index`,
            dataset_id, dataset_datapoint_id, dataset_datapoint_created_at,
            group_id, scores
        )
        SELECT
            existing.id,
            existing.evaluation_id,
            existing.project_id,
            {trace_id_expr},
            fromUnixTimestamp64Nano(toInt64(?), 'UTC') as new_updated_at,
            existing.data,
            existing.target,
            existing.metadata,
            {executor_output_expr},
            existing.`index`,
            existing.dataset_id,
            existing.dataset_datapoint_id,
            existing.dataset_datapoint_created_at,
            ? as new_group_id,
            {scores_expr}
        FROM (
            SELECT * FROM evaluation_datapoints FINAL
            WHERE project_id = ? AND evaluation_id = ? AND id = ?
        ) AS existing",
        trace_id_expr = if trace_id_is_falsey {
            "existing.trace_id".to_string()
        } else {
            "toUUID(?)".to_string()
        },
        executor_output_expr = if executor_output_is_falsey {
            "existing.executor_output".to_string()
        } else {
            "?".to_string()
        },
        scores_expr = if scores_is_empty {
            "existing.scores".to_string()
        } else {
            "if(existing.scores != '', jsonMergePatch(existing.scores, ?), ?)".to_string()
        },
    );

    let mut q = clickhouse.query(&query);

    // Bind in order of appearance:
    // 1. trace_id (only if not falsey)
    if !trace_id_is_falsey {
        q = q.bind(trace_id.unwrap());
    }
    // 2. updated_at
    q = q.bind(now_nanos);
    // 3. executor_output (only if not falsey)
    if !executor_output_is_falsey {
        q = q.bind(new_executor_output.as_str());
    }
    // 4. group_id
    q = q.bind(group_id.as_str());
    // 5. scores (only if not empty; 2 binds for jsonMergePatch branch + fallback)
    if !scores_is_empty {
        q = q.bind(new_scores.as_str());
        q = q.bind(new_scores.as_str());
    }
    // 6-8. WHERE clause
    q = q.bind(project_id);
    q = q.bind(evaluation_id);
    q = q.bind(datapoint_id);

    q.execute().await.map_err(|e| {
        anyhow::anyhow!(
            "Clickhouse evaluation datapoint update INSERT...SELECT failed: {:?}",
            e
        )
    })?;

    Ok(())
}
