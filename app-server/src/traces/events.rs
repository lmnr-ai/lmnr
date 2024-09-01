use std::{collections::HashMap, env, sync::Arc};

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    db::{
        self,
        event_templates::{EventTemplate, EventType},
        events::{EventObservation, EventSource},
        trace::{Span, SpanWithChecksAndEvents},
        DB,
    },
    language_model::{
        ChatMessage, ChatMessageContent, LanguageModelProviderName, LanguageModelRunner, NodeInfo,
    },
};

pub async fn create_events(
    db: Arc<DB>,
    event_payloads: Vec<EventObservation>,
    event_source: EventSource,
    project_id: Uuid,
) -> Result<()> {
    let event_types = db::event_templates::get_template_types(
        &db.pool,
        &event_payloads
            .iter()
            .map(|o| o.template_name.clone())
            .collect(),
        project_id,
    )
    .await?;

    let mut events = vec![];

    for mut event_payload in event_payloads.into_iter() {
        let event_type = event_types
            .get(&event_payload.template_name)
            .map(|et| et.to_owned());

        let event_type = match event_type {
            Some(event_type) => event_type,
            None => {
                let id = Uuid::new_v4();
                // If the user wants to use events for simply logging, create a boolean event, if there's no template for such event
                let event_template = db::event_templates::create_or_update_event_template(
                    &db.pool,
                    id,
                    event_payload.template_name.clone(),
                    project_id,
                    None,
                    None,
                    EventType::BOOLEAN,
                )
                .await?;
                event_template.event_type
            }
        };

        match event_type {
            EventType::BOOLEAN => {
                let value = match event_payload.value.clone() {
                    Some(v) => v,
                    None => Value::Bool(true), // IMPORTANT: Default to true for boolean events
                };
                event_payload.value = Some(value.clone());
                let _bool_value = match serde_json::from_value::<bool>(value) {
                    Ok(v) => v,
                    Err(_) => {
                        log::warn!(
                            "Skipping BOOLEAN event with non-boolean value: {:?}",
                            event_payload
                        );
                        continue;
                    }
                };
                events.push(event_payload);
            }
            EventType::STRING => {
                let Some(value) = event_payload.value.clone() else {
                    log::warn!("Skipping STRING event without value: {:?}", event_payload);
                    continue;
                };
                if serde_json::from_value::<String>(value).is_err() {
                    log::warn!(
                        "Skipping STRING event with non-string value: {:?}",
                        event_payload
                    );
                    continue;
                };
                events.push(event_payload);
            }
            EventType::NUMBER => {
                let Some(value) = event_payload.value.clone() else {
                    log::warn!("Skipping NUMBER event without value: {:?}", event_payload);
                    continue;
                };
                if serde_json::from_value::<f64>(value).is_err() {
                    log::warn!(
                        "Skipping NUMBER event with non-numeric value: {:?}",
                        event_payload
                    );
                    continue;
                };
                events.push(event_payload);
            }
        }
    }

    db::events::create_events_by_template_name(db, events, event_source).await
}

pub struct EvaluateEventResponse {
    reasoning: String,
    value: Value,
}

pub async fn evaluate_event(
    data: String,
    language_model_runner: Arc<LanguageModelRunner>,
    event_template: EventTemplate,
) -> Result<EvaluateEventResponse> {
    let event_instruction = event_template.instruction.unwrap_or_default();
    let event_type = event_template.event_type;
    let event_name = event_template.name;

    let model = format!(
        "{}:gpt-4o-2024-08-06",
        LanguageModelProviderName::OpenAI.to_str()
    );

    let output_type = match event_type {
        db::event_templates::EventType::STRING => "string",
        db::event_templates::EventType::BOOLEAN => "boolean",
        db::event_templates::EventType::NUMBER => "number",
    };

    let prompt = format!(
        r#"You are a smart analyst. Your goal is to follow the instruction and provide reasoning for your answer.

Think clearly and provide reasoning for your answer.

<input>
{}
</input>

<event_name>
{}
</event_name>

<instruction>
{}
</instruction>
"#,
        data, event_name, event_instruction
    );

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: ChatMessageContent::Text(prompt),
    }];
    let params = serde_json::json!({
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "result",
                "description": "Classification result and reasoning",
                "schema": {
                    "type": "object",
                    "properties": {
                        "reasoning": {
                            "type": "string"
                        },
                        "result": {
                            "type": output_type
                        }
                    },
                    "required": ["reasoning", "result"]
                }
            }
        }
    });

    let openai_api_key = env::var("OPENAI_API_KEY").expect("OPENAI_API_KEY must be set");
    let env = HashMap::from([(String::from("OPENAI_API_KEY"), openai_api_key)]);

    // TODO: Get rid of this
    let random_uuid = Uuid::new_v4();
    let node_info = NodeInfo {
        id: random_uuid,
        node_id: random_uuid,
        node_name: "TODO".to_string(),
        node_type: "TODO".to_string(),
    };

    let completion = language_model_runner
        .chat_completion(&model, &messages, &params, &env, None, &node_info)
        .await?;

    let text = completion.text_message();

    let structured_output = serde_json::from_str::<HashMap<String, Value>>(&text)?;
    let reasoning = structured_output
        .get("reasoning")
        .expect("Reasoning must be provided")
        .as_str()
        .unwrap_or_default()
        .to_string();

    // TODO: Validate the output type
    let result = structured_output
        .get("result")
        .expect("Result must be provided")
        .clone();

    Ok(EvaluateEventResponse {
        reasoning,
        value: result,
    })
}

pub async fn check_and_record_event(
    span: Span,
    db: Arc<DB>,
    language_model_runner: Arc<LanguageModelRunner>,
    event_template_name: String,
    data: String,
    timestamp: Option<DateTime<Utc>>,
    project_id: Uuid,
) -> Result<()> {
    let event_template =
        db::event_templates::get_event_template_by_name(&db.pool, &event_template_name, project_id)
            .await?;

    let span_id = span.id;
    let event_type_id = event_template.id;
    let timestamp = timestamp.unwrap_or(span.end_time);

    match evaluate_event(data.clone(), language_model_runner, event_template).await {
        Ok(res) => {
            db::events::create_event(
                &db.pool,
                span_id,
                timestamp,
                event_type_id,
                db::events::EventSource::AUTO,
                Some(serde_json::json!({
                    "reasoning": res.reasoning,
                })),
                res.value,
                Some(data),
            )
            .await?;
        }
        Err(e) => {
            log::error!("Failed to classify if event happened: {}", e);
        }
    }

    Ok(())
}

/// Classifies if events happened in the spans and records to the database.
pub async fn auto_check_and_record_events(
    spans_with_checks: Vec<SpanWithChecksAndEvents>,
    db: Arc<DB>,
    language_model_runner: Arc<LanguageModelRunner>,
    project_id: Uuid,
) -> Result<()> {
    let mut tasks = vec![];

    for span_with_checks in spans_with_checks {
        for evaluate_event in span_with_checks.evaluate_events {
            let span = span_with_checks.span.clone();
            let db = db.clone();
            let language_model_runner = language_model_runner.clone();
            let task = tokio::spawn(async move {
                check_and_record_event(
                    span,
                    db,
                    language_model_runner,
                    evaluate_event.name,
                    evaluate_event.data,
                    evaluate_event.timestamp,
                    project_id,
                )
                .await
            });

            tasks.push(task);
        }
    }

    let join_res = futures::future::try_join_all(tasks).await?;
    for res in join_res {
        if let Err(e) = res {
            log::error!("Failed to check and record event: {:?}", e);
        }
    }

    Ok(())
}
