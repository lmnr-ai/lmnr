use anyhow::Result;
use chrono::Utc;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::evaluators::EvaluatorScoreSource;

use super::utils::chrono_to_nanoseconds;

#[derive(Row, Deserialize, Serialize)]
pub struct CHEvaluatorScore {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub evaluator_id: Uuid,
    pub name: String,
    pub source: u8,
    pub score: f64,
    pub created_at: i64,
}

impl CHEvaluatorScore {
    pub fn new(
        id: Uuid,
        project_id: Uuid,
        name: &str,
        source: EvaluatorScoreSource,
        span_id: Uuid,
        evaluator_id: Option<Uuid>,
        score: f64,
    ) -> Self {
        Self {
            id,
            project_id,
            name: name.to_string(),
            source: source.into(),
            span_id,
            evaluator_id: evaluator_id.unwrap_or(Uuid::nil()),
            score,
            created_at: chrono_to_nanoseconds(Utc::now()),
        }
    }
}

pub async fn insert_evaluator_score_ch(
    clickhouse: clickhouse::Client,
    id: Uuid,
    project_id: Uuid,
    name: &str,
    source: EvaluatorScoreSource,
    span_id: Uuid,
    evaluator_id: Option<Uuid>,
    score: f64,
) -> Result<()> {
    let ch_insert = clickhouse.insert("evaluator_scores");
    match ch_insert {
        Ok(mut ch_insert) => {
            ch_insert
                .write(&CHEvaluatorScore::new(
                    id,
                    project_id,
                    name,
                    source,
                    span_id,
                    evaluator_id,
                    score,
                ))
                .await?;
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => Err(anyhow::anyhow!(
                    "Clickhouse evaluator score insertion failed: {:?}",
                    e
                )),
            }
        }
        Err(e) => Err(anyhow::anyhow!(
            "Failed to insert evaluator score into Clickhouse: {:?}",
            e
        )),
    }
}

impl Into<u8> for EvaluatorScoreSource {
    fn into(self) -> u8 {
        match self {
            EvaluatorScoreSource::Evaluator => 0,
            EvaluatorScoreSource::Code => 1,
        }
    }
}
