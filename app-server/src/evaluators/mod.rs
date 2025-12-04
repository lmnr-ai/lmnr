use std::{collections::HashMap, sync::Arc};

use async_trait::async_trait;

use crate::{
    cache::{Cache, CacheTrait, keys::PROJECT_EVALUATORS_BY_PATH_CACHE_KEY},
    ch::evaluator_scores::insert_evaluator_score_ch,
    db::{
        DB,
        evaluators::{
            Evaluator, EvaluatorScoreSource, get_evaluator, get_evaluators_by_ids_from_db,
            get_evaluators_by_path_from_db, insert_evaluator_score,
        },
    },
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
    worker::MessageHandler,
};
use reqwest;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub const EVALUATORS_EXCHANGE: &str = "evaluators_exchange";
pub const EVALUATORS_QUEUE: &str = "evaluators_queue";
pub const EVALUATORS_ROUTING_KEY: &str = "evaluators_routing_key";

#[derive(Serialize, Deserialize, Clone)]
pub struct EvaluatorsQueueMessage {
    pub span_id: Uuid,
    pub project_id: Uuid,
    pub id: Uuid,
    pub span_output: Value,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct EvaluatorRequest {
    pub definition: HashMap<String, Value>,
    pub input: Value,
}

#[derive(Deserialize)]
pub struct EvaluatorResponse {
    pub score: Option<f64>,
    #[serde(default)]
    pub error: Option<String>,
}

/// Handler for evaluators
pub struct EvaluatorHandler {
    pub db: Arc<DB>,
    pub clickhouse: clickhouse::Client,
    pub client: Arc<reqwest::Client>,
    pub python_online_evaluator_url: String,
}

#[async_trait]
impl MessageHandler for EvaluatorHandler {
    type Message = EvaluatorsQueueMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), crate::worker::HandlerError> {
        let evaluator = get_evaluator(&self.db, message.id, message.project_id)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to get evaluator: {}", e))?;

        let body = EvaluatorRequest {
            definition: evaluator.definition,
            input: message.span_output,
        };

        let resp = self
            .client
            .post(&self.python_online_evaluator_url)
            .json(&body)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send request to evaluator: {}", e))?;

        let status = resp.status();

        if !status.is_success() {
            let error_body = resp.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!(
                "Evaluator service returned error {}: {}",
                status,
                error_body
            )
            .into());
        }

        let evaluator_response = resp
            .json::<EvaluatorResponse>()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to parse evaluator response: {}", e))?;

        if let Some(error) = evaluator_response.error {
            return Err(anyhow::anyhow!("Evaluator execution error: {}", error).into());
        }

        if let Some(score) = evaluator_response.score {
            let score_id = Uuid::new_v4();

            insert_evaluator_score(
                &self.db.pool,
                score_id,
                message.project_id,
                &evaluator.name,
                EvaluatorScoreSource::Evaluator,
                message.span_id,
                Some(message.id),
                score,
                None,
            )
            .await
            .map_err(|e| anyhow::anyhow!("Failed to insert evaluator score to DB: {}", e))?;

            insert_evaluator_score_ch(
                self.clickhouse.clone(),
                score_id,
                message.project_id,
                &evaluator.name,
                EvaluatorScoreSource::Evaluator,
                message.span_id,
                Some(message.id),
                score,
            )
            .await
            .map_err(|e| anyhow::anyhow!("Failed to insert evaluator score to ClickHouse: {}", e))?;
        } else {
            log::info!(
                "Evaluator returned null score (skipped) for span_id: {}",
                message.span_id
            );
        }

        Ok(())
    }
}

pub async fn push_to_evaluators_queue(
    span_id: Uuid,
    project_id: Uuid,
    evaluator_id: Uuid,
    span_output: Value,
    queue: Arc<MessageQueue>,
) -> Result<(), anyhow::Error> {
    let message = EvaluatorsQueueMessage {
        span_id,
        project_id,
        id: evaluator_id,
        span_output,
    };

    let mq_message = serde_json::to_vec(&message)?;

    if mq_message.len() >= mq_max_payload() {
        log::warn!(
            "[EVALUATORS] MQ payload limit exceeded. Project ID: [{}], payload size: [{}], span_id: [{}]",
            project_id,
            mq_message.len(),
            span_id
        );
        // Don't return error for now, skip publishing
    } else {
        queue
            .publish(&mq_message, EVALUATORS_EXCHANGE, EVALUATORS_ROUTING_KEY)
            .await?;
    }

    Ok(())
}

pub async fn get_evaluators_by_path(
    db: &DB,
    cache: Arc<Cache>,
    project_id: Uuid,
    path: Vec<String>,
) -> anyhow::Result<Vec<Evaluator>> {
    let cache_key = format!(
        "{PROJECT_EVALUATORS_BY_PATH_CACHE_KEY}:{project_id}:{}",
        serde_json::to_string(&path)?
    );
    match cache.get::<Vec<Uuid>>(&cache_key).await {
        Ok(Some(evaluator_ids)) => {
            // Get full evaluator objects from database using cached IDs
            let evaluators =
                get_evaluators_by_ids_from_db(&db.pool, project_id, evaluator_ids).await?;
            Ok(evaluators)
        }
        _ => {
            // Get evaluators from database and cache only their IDs
            let evaluators = get_evaluators_by_path_from_db(&db.pool, project_id, path).await?;
            let evaluator_ids: Vec<Uuid> = evaluators.iter().map(|e| e.id).collect();
            cache.insert(&cache_key, evaluator_ids).await?;
            Ok(evaluators)
        }
    }
}
