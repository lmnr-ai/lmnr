use std::{collections::HashMap, sync::Arc};

use backoff::ExponentialBackoffBuilder;

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
    mq::{MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiverTrait, MessageQueueTrait},
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

pub async fn process_evaluators(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    evaluators_message_queue: Arc<MessageQueue>,
    client: Arc<reqwest::Client>,
    python_online_evaluator_url: String,
) -> () {
    loop {
        inner_process_evaluators(
            db.clone(),
            clickhouse.clone(),
            evaluators_message_queue.clone(),
            client.clone(),
            &python_online_evaluator_url,
        )
        .await;
    }
}

pub async fn inner_process_evaluators(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    client: Arc<reqwest::Client>,
    python_online_evaluator_url: &str,
) {
    // Add retry logic with exponential backoff for connection failures
    let get_receiver = || async {
        queue
            .get_receiver(
                EVALUATORS_QUEUE,
                EVALUATORS_EXCHANGE,
                EVALUATORS_ROUTING_KEY,
            )
            .await
            .map_err(|e| {
                log::error!("Failed to get receiver from evaluators queue: {:?}", e);
                backoff::Error::transient(e)
            })
    };

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(std::time::Duration::from_secs(1))
        .with_max_interval(std::time::Duration::from_secs(60))
        .with_max_elapsed_time(Some(std::time::Duration::from_secs(300))) // 5 minutes max
        .build();

    let mut receiver = match backoff::future::retry(backoff, get_receiver).await {
        Ok(receiver) => {
            log::info!("Successfully connected to evaluators queue");
            receiver
        }
        Err(e) => {
            log::error!(
                "Failed to connect to evaluators queue after retries: {:?}",
                e
            );
            return;
        }
    };

    while let Some(delivery) = receiver.receive().await {
        if let Err(e) = delivery {
            log::error!("Failed to receive message from queue: {:?}", e);
            continue;
        }
        let delivery = delivery.unwrap();
        let acker = delivery.acker();
        let message = match serde_json::from_slice::<EvaluatorsQueueMessage>(&delivery.data()) {
            Ok(message) => message,
            Err(e) => {
                log::error!("Failed to deserialize message from queue: {:?}", e);
                let _ = acker.reject(false).await;
                continue;
            }
        };

        let evaluator = match get_evaluator(&db, message.id, message.project_id).await {
            Ok(evaluator) => evaluator,
            Err(e) => {
                log::error!("Failed to get evaluator {}: {:?}", message.id, e);
                let _ = acker.reject(false).await;
                continue;
            }
        };

        let body = EvaluatorRequest {
            definition: evaluator.definition,
            input: message.span_output,
        };

        // For now we call only python, later check for evaluator_type and call corresponing url
        let response = client
            .post(python_online_evaluator_url)
            .json(&body)
            .send()
            .await;

        match response {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    match resp.json::<EvaluatorResponse>().await {
                        Ok(evaluator_response) => {
                            if let Some(error) = evaluator_response.error {
                                log::error!("Evaluator execution error: {}", error);
                                let _ = acker.reject(false).await;
                                continue;
                            }

                            match evaluator_response.score {
                                Some(score) => {
                                    let score_id = Uuid::new_v4();

                                    if let Err(e) = insert_evaluator_score(
                                        &db.pool,
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
                                    {
                                        log::error!(
                                            "Failed to save evaluator score to database: {:?}",
                                            e
                                        );
                                        let _ = acker.reject(false).await;
                                        continue;
                                    }

                                    if let Err(e) = insert_evaluator_score_ch(
                                        clickhouse.clone(),
                                        score_id,
                                        message.project_id,
                                        &evaluator.name,
                                        EvaluatorScoreSource::Evaluator,
                                        message.span_id,
                                        Some(message.id),
                                        score,
                                    )
                                    .await
                                    {
                                        log::error!(
                                            "Failed to save evaluator score to ClickHouse: {:?}",
                                            e
                                        );
                                        let _ = acker.reject(false).await;
                                        continue;
                                    }

                                    let _ = acker.ack().await;
                                }
                                None => {
                                    log::info!(
                                        "Evaluator returned null score (skipped) for span_id: {}",
                                        message.span_id
                                    );
                                    let _ = acker.ack().await;
                                }
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to parse evaluator response JSON: {:?}", e);
                            let _ = acker.reject(false).await;
                        }
                    }
                } else if status.is_server_error() {
                    log::error!("Evaluator service returned server error {}", status);
                    let _ = acker.reject(false).await;
                } else if status.is_client_error() {
                    log::error!(
                        "Evaluator service returned client error {}: not retrying",
                        status
                    );
                    match resp.text().await {
                        Ok(error_body) => log::error!("Error response body: {}", error_body),
                        Err(_) => log::error!("Could not read error response body"),
                    }
                    let _ = acker.reject(false).await;
                } else {
                    log::error!("Evaluator service returned unexpected status {}", status);
                    let _ = acker.reject(false).await;
                }
            }
            Err(e) => {
                log::error!("Failed to send request to evaluator service: {:?}", e);
                let _ = acker.reject(false).await;
            }
        }
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

    queue
        .publish(
            &serde_json::to_vec(&message)?,
            EVALUATORS_EXCHANGE,
            EVALUATORS_ROUTING_KEY,
        )
        .await?;

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
