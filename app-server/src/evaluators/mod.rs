use std::{collections::HashMap, sync::Arc};

use crate::{
    db::{
        DB,
        evaluators::{get_evaluator, save_evaluator_score},
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
    pub data: HashMap<String,Value>,
    pub input: Value,
}

#[derive(Deserialize)]
pub struct EvaluatorResponse {
    pub score: Option<i32>,
    #[serde(default)]
    pub error: Option<String>,
}

pub async fn process_evaluators(
    db: Arc<DB>,
    evaluators_message_queue: Arc<MessageQueue>,
    client: Arc<reqwest::Client>,
    lambda_url: String,
) -> () {
    loop {
        inner_process_evaluators(
            db.clone(),
            evaluators_message_queue.clone(),
            client.clone(),
            &lambda_url,
        )
        .await;
    }
}

pub async fn inner_process_evaluators(
    db: Arc<DB>,
    queue: Arc<MessageQueue>,
    client: Arc<reqwest::Client>,
    lambda_url: &str,
) {
    let mut receiver = queue
        .get_receiver(
            EVALUATORS_QUEUE,
            EVALUATORS_EXCHANGE,
            EVALUATORS_ROUTING_KEY,
        )
        .await
        .unwrap();

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
                let _ = acker.reject(true).await;
                continue;
            }
        };

        let body = EvaluatorRequest {
            data: evaluator.data,
            input: message.span_output,
        };

        // For now we call only python, later check for evaluator_type and call corresponing url
        let response = client.post(lambda_url).json(&body).send().await;

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
                                    log::info!(
                                        "Received score {} for span_id: {} from evaluator_id: {}",
                                        score,
                                        message.span_id,
                                        message.id
                                    );

                                    match save_evaluator_score(
                                        &db,
                                        message.span_id,
                                        message.id,
                                        score,
                                    )
                                    .await
                                    {
                                        Ok(()) => {
                                            log::info!(
                                                "Successfully saved evaluator score for span_id: {}",
                                                message.span_id
                                            );
                                            let _ = acker.ack().await;
                                        }
                                        Err(e) => {
                                            log::error!(
                                                "Failed to save evaluator score to database: {:?}",
                                                e
                                            );
                                            let _ = acker.reject(true).await;
                                        }
                                    }
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
                    log::error!(
                        "Evaluator lambda returned server error {}: retrying",
                        status
                    );
                    let _ = acker.reject(true).await;
                } else if status.is_client_error() {
                    log::error!(
                        "Evaluator lambda returned client error {}: not retrying",
                        status
                    );
                    match resp.text().await {
                        Ok(error_body) => log::error!("Error response body: {}", error_body),
                        Err(_) => log::error!("Could not read error response body"),
                    }
                    let _ = acker.reject(false).await;
                } else {
                    log::error!("Evaluator lambda returned unexpected status {}", status);
                    let _ = acker.reject(true).await;
                }
            }
            Err(e) => {
                log::error!("Failed to send request to evaluator lambda: {:?}", e);
                let _ = acker.reject(true).await;
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