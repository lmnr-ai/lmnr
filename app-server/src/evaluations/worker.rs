use std::collections::HashMap;
use std::io::Cursor;
use std::sync::Arc;

use backoff::ExponentialBackoffBuilder;
use chrono::Utc;
use mustache;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::ai_gateway::{AIGateway, AIGatewayRequest};
use crate::api::v1::traces::RabbitMqSpanMessage;
use crate::ch::datapoints::get_datapoint_by_id;
use crate::datasets::datapoints::Datapoint;
use crate::db::playgrounds::Playground;
use crate::db::spans::{Span, SpanType};
use crate::db::{self, DB};
use crate::evaluations::save_evaluation_scores;
use crate::evaluations::utils::{EvaluationDatapointDatasetLink, EvaluationDatapointResult};
use crate::evaluators::{EvaluatorRequest, EvaluatorResponse};
use crate::mq::{
    MessageQueue, MessageQueueAcker, MessageQueueDeliveryTrait, MessageQueueReceiverTrait,
    MessageQueueTrait,
};
use crate::traces::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY};

pub const EVALUATIONS_QUEUE: &str = "evaluations_queue";
pub const EVALUATIONS_EXCHANGE: &str = "evaluations_exchange";
pub const EVALUATIONS_ROUTING_KEY: &str = "evaluations_routing_key";

/// Playground executor configuration
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaygroundExecutor {
    pub playground_id: Uuid,
}

/// Evaluator reference configuration
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EvaluatorConfig {
    pub evaluator_id: Uuid,
}

/// Executor type - defines what runs the core logic
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Executor {
    /// Execute using a playground configuration
    Playground(PlaygroundExecutor),
}

/// Evaluator reference - defines what evaluates the output
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EvaluatorRef {
    /// Use an existing evaluator by ID
    Evaluator(EvaluatorConfig),
}

/// Message pushed to the evaluations queue for processing a single datapoint
/// Note: Datapoint data is fetched in the worker to avoid large queue payloads
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationDatapointMessage {
    pub project_id: Uuid,
    pub evaluation_id: Uuid,
    pub group_id: String,
    pub dataset_id: Uuid,
    /// Only the datapoint ID - full data fetched in worker
    pub datapoint_id: Uuid,
    pub datapoint_index: i32,
    /// Executor configuration
    pub executor: Executor,
    /// Evaluator reference
    pub evaluator: EvaluatorRef,
}

/// Push a single datapoint message to the evaluations queue
pub async fn push_to_evaluations_queue(
    message: EvaluationDatapointMessage,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let serialized = serde_json::to_vec(&message)?;

    queue
        .publish(&serialized, EVALUATIONS_EXCHANGE, EVALUATIONS_ROUTING_KEY)
        .await?;

    log::debug!(
        "Pushed evaluation message to queue: evaluation_id={}, datapoint_id={}",
        message.evaluation_id,
        message.datapoint_id
    );

    Ok(())
}

/// Main worker function to process evaluation messages
pub async fn process_evaluations(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    ai_gateway: Arc<AIGateway>,
    evaluator_client: Arc<reqwest::Client>,
    python_evaluator_url: String,
) {
    loop {
        inner_process_evaluations(
            db.clone(),
            clickhouse.clone(),
            queue.clone(),
            ai_gateway.clone(),
            evaluator_client.clone(),
            &python_evaluator_url,
        )
        .await;
        log::warn!("Evaluations listener exited. Rebinding queue connection...");
    }
}

async fn inner_process_evaluations(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    ai_gateway: Arc<AIGateway>,
    evaluator_client: Arc<reqwest::Client>,
    python_evaluator_url: &str,
) {
    let get_receiver = || async {
        queue
            .get_receiver(
                EVALUATIONS_QUEUE,
                EVALUATIONS_EXCHANGE,
                EVALUATIONS_ROUTING_KEY,
            )
            .await
            .map_err(|e| {
                log::error!("Failed to get receiver from evaluations queue: {:?}", e);
                backoff::Error::transient(e)
            })
    };

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(std::time::Duration::from_secs(1))
        .with_max_interval(std::time::Duration::from_secs(60))
        .with_max_elapsed_time(Some(std::time::Duration::from_secs(300)))
        .build();

    let mut receiver = match backoff::future::retry(backoff, get_receiver).await {
        Ok(receiver) => {
            log::info!("Successfully connected to evaluations queue");
            receiver
        }
        Err(e) => {
            log::error!(
                "Failed to connect to evaluations queue after retries: {:?}",
                e
            );
            return;
        }
    };

    log::info!("Started processing evaluations from queue");

    while let Some(delivery) = receiver.receive().await {
        if let Err(e) = delivery {
            log::error!("Failed to receive message from evaluations queue: {:?}", e);
            continue;
        }
        let delivery = delivery.unwrap();
        let acker = delivery.acker();
        let message = match serde_json::from_slice::<EvaluationDatapointMessage>(&delivery.data()) {
            Ok(message) => message,
            Err(e) => {
                log::error!("Failed to deserialize evaluation message: {:?}", e);
                let _ = acker.reject(false).await;
                continue;
            }
        };

        if let Err(e) = process_single_evaluation(
            db.clone(),
            clickhouse.clone(),
            queue.clone(),
            ai_gateway.clone(),
            evaluator_client.clone(),
            python_evaluator_url,
            message,
            acker,
        )
        .await
        {
            log::error!("Failed to process evaluation: {:?}", e);
        }
    }

    log::warn!("Evaluations queue closed connection. Shutting down evaluations listener");
}

async fn process_single_evaluation(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    ai_gateway: Arc<AIGateway>,
    evaluator_client: Arc<reqwest::Client>,
    python_evaluator_url: &str,
    message: EvaluationDatapointMessage,
    acker: MessageQueueAcker,
) -> anyhow::Result<()> {
    // 1. Fetch the datapoint data from ClickHouse
    let datapoint: Datapoint =
        match get_datapoint_by_id(clickhouse.clone(), message.datapoint_id, message.project_id)
            .await?
        {
            Some(ch_dp) => ch_dp.into(),
            None => {
                log::error!(
                    "Datapoint {} not found for project {}",
                    message.datapoint_id,
                    message.project_id
                );
                reject_message(&acker).await;
                return Ok(());
            }
        };

    // 2. Get executor configuration (playground)
    let playground = match &message.executor {
        Executor::Playground(executor) => {
            match db::playgrounds::get_playground(
                &db.pool,
                executor.playground_id,
                message.project_id,
            )
            .await?
            {
                Some(p) => p,
                None => {
                    log::error!(
                        "Playground {} not found for project {}",
                        executor.playground_id,
                        message.project_id
                    );
                    reject_message(&acker).await;
                    return Ok(());
                }
            }
        }
    };

    // 3. Get evaluator configuration
    let evaluator = match &message.evaluator {
        EvaluatorRef::Evaluator(config) => {
            match db::evaluators::get_evaluator(&db, config.evaluator_id, message.project_id).await
            {
                Ok(e) => e,
                Err(e) => {
                    log::error!("Failed to get evaluator {}: {:?}", config.evaluator_id, e);
                    reject_message(&acker).await;
                    return Ok(());
                }
            }
        }
    };

    // 4. Render the prompt template with datapoint data
    let rendered_messages = match render_prompt_messages(&playground, &datapoint) {
        Ok(messages) => messages,
        Err(e) => {
            log::error!(
                "Failed to render prompt messages for datapoint {}: {:?}",
                message.datapoint_id,
                e
            );
            reject_message(&acker).await;
            return Ok(());
        }
    };

    // 5. Call AI Gateway with playground configuration
    let executor_start_time = Utc::now();
    let executor_request = AIGatewayRequest {
        model: playground.model_id.clone(),
        messages: rendered_messages.clone(),
        max_tokens: playground.max_tokens,
        temperature: playground.temperature,
        structured_output: playground.output_schema.clone(),
        tools: playground
            .tools
            .as_ref()
            .and_then(|t| serde_json::to_string(t).ok()),
        tool_choice: playground.tool_choice.clone(),
        provider_options: playground.provider_options.clone(),
    };
    let executor_output = match ai_gateway.call(executor_request, message.project_id).await {
        Ok(response) => response,
        Err(e) => {
            log::error!(
                "Failed to call AI Gateway for datapoint {}: {:?}",
                message.datapoint_id,
                e
            );
            reject_message(&acker).await;
            return Ok(());
        }
    };
    let executor_end_time = Utc::now();

    // 6. Run evaluator on the executor output
    let evaluator_start_time = Utc::now();
    let evaluator_result = run_evaluator(
        &ai_gateway,
        message.project_id,
        &evaluator_client,
        python_evaluator_url,
        &evaluator,
        &datapoint,
        &executor_output,
    )
    .await;
    let evaluator_end_time = Utc::now();

    let score = match evaluator_result {
        Ok(Some(s)) => s,
        Ok(None) => {
            log::info!(
                "Evaluator returned null score for datapoint {}",
                message.datapoint_id
            );
            // Still acknowledge the message, but don't save scores
            if let Err(e) = acker.ack().await {
                log::error!("Failed to ack evaluation message: {:?}", e);
            }
            return Ok(());
        }
        Err(e) => {
            log::error!(
                "Failed to run evaluator for datapoint {}: {:?}",
                message.datapoint_id,
                e
            );
            reject_message(&acker).await;
            return Ok(());
        }
    };

    // 7. Create spans (evaluation span, executor/LLM span, evaluator span)
    let trace_id = Uuid::new_v4();
    let evaluation_span_id = Uuid::new_v4();
    let executor_span_id = Uuid::new_v4();
    let evaluator_span_id = Uuid::new_v4();

    let evaluation_span = Span::new(
        message.project_id,
        trace_id,
        evaluation_span_id,
        None,
        "evaluation".to_string(),
        SpanType::EVALUATION,
        executor_start_time,
        evaluator_end_time,
        Some(datapoint.data.clone()),
        Some(json!({ &evaluator.name: score })),
    );

    let executor_span = Span::new(
        message.project_id,
        trace_id,
        executor_span_id,
        Some(evaluation_span_id),
        format!("{}.chat", playground.model_id),
        SpanType::LLM,
        executor_start_time,
        executor_end_time,
        Some(rendered_messages.clone()),
        Some(executor_output.clone()),
    );

    let evaluator_span_obj = Span::new(
        message.project_id,
        trace_id,
        evaluator_span_id,
        Some(evaluation_span_id),
        evaluator.name.clone(),
        SpanType::EVALUATOR,
        evaluator_start_time,
        evaluator_end_time,
        Some(executor_output.clone()),
        Some(json!({ "score": score })),
    );

    // 8. Push spans to the observations queue
    let spans_message = vec![
        RabbitMqSpanMessage {
            span: evaluation_span,
            events: vec![],
        },
        RabbitMqSpanMessage {
            span: executor_span,
            events: vec![],
        },
        RabbitMqSpanMessage {
            span: evaluator_span_obj,
            events: vec![],
        },
    ];

    let mq_message = serde_json::to_vec(&spans_message)?;
    if let Err(e) = queue
        .publish(&mq_message, OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY)
        .await
    {
        log::error!("Failed to publish spans to observations queue: {:?}", e);
        reject_message(&acker).await;
        return Ok(());
    }

    // 9. Save evaluation scores
    let mut scores = HashMap::new();
    scores.insert(evaluator.name.clone(), Some(score));

    let evaluation_datapoint_result = EvaluationDatapointResult {
        id: Uuid::new_v4(),
        index: message.datapoint_index,
        data: datapoint.data.clone(),
        target: datapoint.target.clone().unwrap_or(Value::Null),
        metadata: Some(datapoint.metadata.clone()),
        executor_output: Some(executor_output),
        trace_id,
        scores,
        dataset_link: Some(EvaluationDatapointDatasetLink {
            dataset_id: message.dataset_id,
            datapoint_id: message.datapoint_id,
            created_at: datapoint.created_at,
        }),
    };

    if let Err(e) = save_evaluation_scores(
        db.clone(),
        clickhouse,
        vec![evaluation_datapoint_result],
        message.evaluation_id,
        message.project_id,
        &message.group_id,
    )
    .await
    {
        log::error!(
            "Failed to save evaluation scores for datapoint {}: {:?}",
            message.datapoint_id,
            e
        );
        reject_message(&acker).await;
        return Ok(());
    }

    // 10. Acknowledge the message
    if let Err(e) = acker.ack().await {
        log::error!("Failed to ack evaluation message: {:?}", e);
    }

    log::info!(
        "Successfully processed evaluation for datapoint {}, evaluation_id={}",
        message.datapoint_id,
        message.evaluation_id
    );

    Ok(())
}

/// Render a template string using mustache with the given context
/// This is a general function that can be used for both executor prompts and evaluator prompts
pub fn render_template(template_str: &str, context: &Value) -> anyhow::Result<String> {
    let template = mustache::compile_str(template_str)
        .map_err(|e| anyhow::anyhow!("Failed to compile mustache template: {:?}", e))?;

    // Build mustache data from JSON value
    let data = json_value_to_mustache_data(context);

    let mut output = Cursor::new(Vec::new());
    template
        .render_data(&mut output, &data)
        .map_err(|e| anyhow::anyhow!("Failed to render mustache template: {:?}", e))?;

    let rendered = String::from_utf8(output.into_inner())
        .map_err(|e| anyhow::anyhow!("Failed to convert rendered template to string: {:?}", e))?;

    Ok(rendered)
}

/// Convert a serde_json::Value to mustache::Data for template rendering
/// Strings are JSON-escaped so they can be safely inserted into JSON templates
fn json_value_to_mustache_data(value: &Value) -> mustache::Data {
    match value {
        Value::Null => mustache::Data::Bool(false),
        Value::Bool(b) => mustache::Data::Bool(*b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                mustache::Data::String(i.to_string())
            } else if let Some(f) = n.as_f64() {
                mustache::Data::String(f.to_string())
            } else {
                mustache::Data::String(n.to_string())
            }
        }
        Value::String(s) => {
            // JSON-escape the string so it can be safely inserted into JSON templates
            // This handles newlines, quotes, backslashes, and control characters
            mustache::Data::String(escape_json_string(s))
        }
        Value::Array(arr) => {
            let vec: Vec<mustache::Data> = arr.iter().map(json_value_to_mustache_data).collect();
            mustache::Data::Vec(vec)
        }
        Value::Object(obj) => {
            // Create a Map for mustache to traverse nested keys
            let map: HashMap<String, mustache::Data> = obj
                .iter()
                .map(|(k, v)| (k.clone(), json_value_to_mustache_data(v)))
                .collect();
            mustache::Data::Map(map)
        }
    }
}

/// Escape a string for safe insertion into a JSON string value
/// Handles newlines, tabs, carriage returns, quotes, backslashes, and control characters
fn escape_json_string(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => result.push_str("\\\""),
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            c if c.is_control() => {
                // Escape other control characters as \uXXXX
                result.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => result.push(c),
        }
    }
    result
}

/// Build context for template rendering from datapoint data
/// Used for executor/playground prompt rendering
pub fn build_datapoint_context(datapoint: &Datapoint) -> Value {
    let mut context = serde_json::Map::new();

    // Add datapoint data fields to context (flattened at top level)
    if let Value::Object(data_obj) = &datapoint.data {
        for (key, value) in data_obj {
            context.insert(key.clone(), value.clone());
        }
    }

    // Also add the entire data object as "data"
    context.insert("data".to_string(), datapoint.data.clone());

    // Add target if present
    if let Some(target) = &datapoint.target {
        context.insert("target".to_string(), target.clone());
    }

    // Add metadata
    context.insert(
        "metadata".to_string(),
        serde_json::to_value(&datapoint.metadata).unwrap_or(Value::Object(serde_json::Map::new())),
    );

    Value::Object(context)
}

/// Build context for LLM evaluator template rendering
/// Includes:
/// - output: The executor output
/// - data: The datapoint data
/// - target: The datapoint target (if present)
/// - All top-level fields from data flattened for convenience
fn build_evaluator_context(datapoint: &Datapoint, executor_output: &Value) -> Value {
    let mut context = serde_json::Map::new();

    // Add executor output as "output"
    context.insert("output".to_string(), executor_output.clone());

    // Add datapoint data as "data"
    context.insert("data".to_string(), datapoint.data.clone());

    // Add target if present
    if let Some(target) = &datapoint.target {
        context.insert("target".to_string(), target.clone());
    }

    // Also flatten top-level data fields for convenience
    if let Value::Object(data_obj) = &datapoint.data {
        for (key, value) in data_obj {
            // Don't overwrite output, data, or target
            if key != "output" && key != "data" && key != "target" {
                context.insert(key.clone(), value.clone());
            }
        }
    }

    Value::Object(context)
}

/// Render prompt messages using mustache templates
fn render_prompt_messages(playground: &Playground, datapoint: &Datapoint) -> anyhow::Result<Value> {
    let context = build_datapoint_context(datapoint);
    render_messages_with_context(&playground.prompt_messages, &context)
}

/// Run the evaluator on the executor output
/// Supports both LLM evaluators and Python evaluators
async fn run_evaluator(
    ai_gateway: &Arc<AIGateway>,
    project_id: Uuid,
    python_client: &Arc<reqwest::Client>,
    python_evaluator_url: &str,
    evaluator: &db::evaluators::Evaluator,
    datapoint: &Datapoint,
    executor_output: &Value,
) -> anyhow::Result<Option<f64>> {
    match evaluator.evaluator_type.as_str() {
        "llm" => {
            run_llm_evaluator(
                ai_gateway,
                project_id,
                evaluator,
                datapoint,
                executor_output,
            )
            .await
        }
        _ => {
            // Default to Python evaluator for backward compatibility
            run_python_evaluator(
                python_client,
                python_evaluator_url,
                &evaluator.definition,
                executor_output,
            )
            .await
        }
    }
}

/// Run an LLM-as-a-judge evaluator
/// The evaluator definition should contain:
/// - prompt_messages: Array of messages with mustache templates
/// - model_id: The model to use (format: provider:model, e.g., "anthropic:claude-sonnet-4-5")
/// - structuredOutput: Optional JSON schema string for structured output
/// - maxTokens, temperature: Optional parameters
///
/// Available mustache template variables:
/// - {{output}} - The executor output (result from the playground/executor)
/// - {{data}} - The entire data object from the datapoint
/// - {{target}} - The target from the datapoint (if present)
/// - Any top-level field from data is also available directly (e.g., {{question}}, {{answer}})
async fn run_llm_evaluator(
    ai_gateway: &Arc<AIGateway>,
    project_id: Uuid,
    evaluator: &db::evaluators::Evaluator,
    datapoint: &Datapoint,
    executor_output: &Value,
) -> anyhow::Result<Option<f64>> {
    // Get prompt messages from evaluator definition
    let prompt_messages = evaluator
        .definition
        .get("prompt_messages")
        .ok_or_else(|| anyhow::anyhow!("LLM evaluator missing prompt_messages in definition"))?;

    // Get model from evaluator definition
    let model_id = evaluator
        .definition
        .get("model_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("LLM evaluator missing model_id in definition"))?;

    // Build context for template rendering with:
    // - output: executor output
    // - data: datapoint data
    // - target: datapoint target (if present)
    // - all top-level fields from data flattened
    let context = build_evaluator_context(datapoint, executor_output);

    // Render prompt messages with context
    let rendered_messages = render_messages_with_context(prompt_messages, &context)?;

    // Get structured output - can be string or object
    let structured_output = evaluator.definition.get("structuredOutput").and_then(|v| {
        if let Some(s) = v.as_str() {
            if !s.is_empty() {
                Some(s.to_string())
            } else {
                None
            }
        } else if v.is_object() {
            serde_json::to_string(v).ok()
        } else {
            None
        }
    });

    // Build request using AIGatewayRequest
    let request = AIGatewayRequest {
        model: model_id.to_string(),
        messages: rendered_messages,
        max_tokens: evaluator
            .definition
            .get("maxTokens")
            .and_then(|v| v.as_i64())
            .map(|v| v as i32),
        temperature: evaluator
            .definition
            .get("temperature")
            .and_then(|v| v.as_f64())
            .map(|v| v as f32),
        structured_output,
        tools: None,
        tool_choice: None,
        provider_options: None,
    };

    // Call AI Gateway
    let response = ai_gateway.call(request, project_id).await?;

    // Extract content from response and parse score
    let content = match &response {
        Value::String(s) => s.clone(),
        _ => serde_json::to_string(&response)?,
    };

    dbg!(&content);

    // Parse the score from the response
    // Try to parse as JSON and extract score field, otherwise try to parse as number
    let score = parse_evaluator_score(&content)?;

    Ok(score)
}

/// Render messages (prompt or evaluator) with a context using mustache templates
/// Serializes the entire messages to string, renders as template, then deserializes back
fn render_messages_with_context(messages: &Value, context: &Value) -> anyhow::Result<Value> {
    // Serialize messages to JSON string
    let messages_str = serde_json::to_string(messages)?;

    // Render the entire string as a mustache template
    let rendered_str = render_template(&messages_str, context)?;

    // Parse back to JSON Value
    let rendered_messages: Value = serde_json::from_str(&rendered_str)
        .map_err(|e| anyhow::anyhow!("Failed to parse rendered messages as JSON: {:?}", e))?;

    Ok(rendered_messages)
}

/// Parse evaluator score from LLM response content
/// Supports:
/// - JSON with "score" field: {"score": 0.85}
/// - Plain number: "0.85" or "85"
fn parse_evaluator_score(content: &str) -> anyhow::Result<Option<f64>> {
    // First, try to parse as JSON
    if let Ok(json_value) = serde_json::from_str::<Value>(content) {
        // Try to extract "score" field
        if let Some(score) = json_value.get("score") {
            if let Some(s) = score.as_f64() {
                return Ok(Some(s));
            }
            if let Some(s) = score.as_i64() {
                return Ok(Some(s as f64));
            }
            if let Some(s) = score.as_str() {
                if let Ok(parsed) = s.parse::<f64>() {
                    return Ok(Some(parsed));
                }
            }
        }
        // Try to extract "value" field as fallback
        if let Some(value) = json_value.get("value") {
            if let Some(s) = value.as_f64() {
                return Ok(Some(s));
            }
            if let Some(s) = value.as_i64() {
                return Ok(Some(s as f64));
            }
        }
        // If JSON but no score field, return None
        return Ok(None);
    }

    // Try to parse as plain number
    let trimmed = content.trim();
    if let Ok(score) = trimmed.parse::<f64>() {
        return Ok(Some(score));
    }

    // Could not parse score
    log::warn!("Could not parse evaluator score from response: {}", content);
    Ok(None)
}

/// Run a Python evaluator
async fn run_python_evaluator(
    client: &Arc<reqwest::Client>,
    evaluator_url: &str,
    definition: &HashMap<String, Value>,
    input: &Value,
) -> anyhow::Result<Option<f64>> {
    let body = EvaluatorRequest {
        definition: definition.clone(),
        input: input.clone(),
    };

    let response = client.post(evaluator_url).json(&body).send().await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!(
            "Python evaluator returned error status {}: {}",
            status,
            error_body
        ));
    }

    let evaluator_response: EvaluatorResponse = response.json().await?;

    if let Some(error) = evaluator_response.error {
        return Err(anyhow::anyhow!("Python evaluator error: {}", error));
    }

    Ok(evaluator_response.score)
}

/// Helper function to reject a message
async fn reject_message(acker: &MessageQueueAcker) {
    if let Err(e) = acker.reject(false).await {
        log::error!("Failed to reject message: {:?}", e);
    }
}
