use anyhow::Result;
use chrono::Utc;
use clickhouse::Row;
use uuid::Uuid;
use serde::{Deserialize, Serialize};

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
    pub score: f64,
    pub created_at: i64,
}


impl CHEvaluatorScore {
    pub fn new(
        id: Uuid,
        project_id: Uuid,
        span_id: Uuid,
        evaluator_id: Uuid,
        score: f64
    ) -> Self {
        Self { 
            id,
            project_id,
            span_id,
            evaluator_id, 
            score, 
            created_at: chrono_to_nanoseconds(Utc::now()),
        }      
    }
}

pub async fn insert_evaluator_score_ch(
    clickhouse: clickhouse::Client,
    id: Uuid,
    project_id: Uuid,
    span_id: Uuid,
    evaluator_id: Uuid,
    score: f64,
) -> Result<()> {
    let ch_insert = clickhouse.insert("evaluator_scores");
    match ch_insert {
        Ok(mut ch_insert) => {
            ch_insert.write(&CHEvaluatorScore::new(id, project_id, span_id, evaluator_id, score)).await?;
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
            ))
    }
}