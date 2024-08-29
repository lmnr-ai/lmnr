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
) -> Result<()> {
    let event_types = db::event_templates::get_template_types(
        &db.pool,
        &event_payloads
            .iter()
            .map(|o| o.template_name.clone())
            .collect(),
    )
    .await?;
    let events = event_payloads
        .into_iter()
        .filter(|o| {
            let event_type = event_types.get(&o.template_name).unwrap();
            match event_type {
                EventType::BOOLEAN => {
                    let Some(value) = o.value.clone() else {
                        log::warn!("Skipping BOOLEAN event without value: {:?}", o);
                        return false;
                    };
                    let _bool_value = match serde_json::from_value::<bool>(value) {
                        Ok(v) => v,
                        Err(_) => {
                            log::warn!("Skipping BOOLEAN event with non-boolean value: {:?}", o);
                            return false;
                        }
                    };
                    // TODO: return `_bool_value`?
                    true
                }
                EventType::STRING => {
                    let Some(value) = o.value.clone() else {
                        log::warn!("Skipping STRING event without value: {:?}", o);
                        return false;
                    };
                    if serde_json::from_value::<String>(value).is_err() {
                        log::warn!("Skipping STRING event with non-string value: {:?}", o);
                        return false;
                    };
                    true
                }
                EventType::NUMBER => {
                    let Some(value) = o.value.clone() else {
                        log::warn!("Skipping SCORE event without value: {:?}", o);
                        return false;
                    };
                    if serde_json::from_value::<f64>(value).is_err() {
                        log::warn!("Skipping NUMBER event with non-numeric value: {:?}", o);
                        return false;
                    };
                    true
                }
            }
        })
        .collect();
    db::events::create_events_by_template_name(db, events, event_source).await
}

pub struct EvaluateEventResponse {
    reasoning: String,
    value: Value,
    should_record_event: bool,
    should_record_value: bool,
}

pub async fn evaluate_event(
    data: String,
    language_model_runner: Arc<LanguageModelRunner>,
    event_template: EventTemplate,
) -> Result<EvaluateEventResponse> {
    let event_instruction = event_template.instruction.unwrap_or_default();
    match event_template.event_type {
        EventType::STRING => {
            let (reasoning, class) = evaluate_class_event(
                data,
                language_model_runner,
                event_template.name,
                event_instruction,
                // classes,
            )
            .await?;

            Ok(EvaluateEventResponse {
                reasoning,
                value: Value::String(class),
                should_record_event: true,
                should_record_value: true,
            })
        }
        EventType::BOOLEAN => {
            let (reasoning, decision) = evaluate_tag_event(
                data,
                language_model_runner,
                event_template.name,
                event_instruction,
            )
            .await?;

            if decision == "YES" {
                return Ok(EvaluateEventResponse {
                    reasoning,
                    value: Value::String("YES".to_string()),
                    should_record_event: true,
                    should_record_value: false,
                });
            }

            Ok(EvaluateEventResponse {
                reasoning,
                value: Value::String("NO".to_string()),
                should_record_event: false,
                should_record_value: false,
            })
        }
        EventType::NUMBER => {
            let (reasoning, score) = evaluate_score_event(
                data,
                language_model_runner,
                event_template.name,
                event_instruction,
                // min,
                // max,
            )
            .await?;

            Ok(EvaluateEventResponse {
                reasoning,
                value: Value::Number(score.into()),
                should_record_event: true,
                should_record_value: true,
            })
        }
    }
}

async fn evaluate_class_event(
    data: String,
    language_model_runner: Arc<LanguageModelRunner>,
    event_name: String,
    event_instruction: String,
    // classes: Vec<String>,
) -> Result<(String, String)> {
    let model = format!(
        "{}:gpt-4o-2024-08-06",
        LanguageModelProviderName::OpenAI.to_str()
    );

    let prompt = format!(
        r#"You are a smart classifier. Your goal is to classify the input according to the event description.

Think clearly and provide reasoning for your answer.

<input>
{}
</input>

<event_name>
{}
</event_name>

<description>
{}
</description>
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
                        }
                        // ,
                        // "class": {
                        //     "type": "string",
                        //     "enum": classes
                        // }
                    },
                    "required": ["reasoning", "class"]
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

    let structured_output = serde_json::from_str::<HashMap<String, String>>(&text)?;
    let reasoning = structured_output
        .get("reasoning")
        .expect("Reasoning must be provided");
    let class = structured_output
        .get("class")
        .expect("Class must be provided");

    Ok((reasoning.clone(), class.clone()))
}

async fn evaluate_tag_event(
    data: String,
    language_model_runner: Arc<LanguageModelRunner>,
    event_name: String,
    event_instruction: String,
) -> Result<(String, String)> {
    let model = format!(
        "{}:gpt-4o-2024-08-06",
        LanguageModelProviderName::OpenAI.to_str()
    );

    let prompt = format!(
        r#"You are a smart analyst. Your goal is to decide whether to assign the tag to the input according to the event description.

Think clearly and provide reasoning for your answer.

<input>
{}
</input>

<event_name>
{}
</event_name>

<description>
{}
</description>
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
                "description": "Result of tag assignment and reasoning",
                "schema": {
                    "type": "object",
                    "properties": {
                        "reasoning": {
                            "type": "string"
                        },
                        "decision": {
                            "type": "string",
                            "description": "Whether to assign the tag or not",
                            "enum": ["YES", "NO"]
                        }
                    },
                    "required": ["reasoning", "decision"]
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

    let structured_output = serde_json::from_str::<HashMap<String, String>>(&text)?;
    let reasoning = structured_output
        .get("reasoning")
        .expect("Reasoning must be provided");
    let decision = structured_output
        .get("decision")
        .expect("assignment decision must be provided");

    Ok((reasoning.clone(), decision.clone()))
}

async fn evaluate_score_event(
    data: String,
    language_model_runner: Arc<LanguageModelRunner>,
    event_name: String,
    event_instruction: String,
    // min: usize,
    // max: usize,
) -> Result<(String, usize)> {
    let model = format!(
        "{}:gpt-4o-2024-08-06",
        LanguageModelProviderName::OpenAI.to_str()
    );

    let prompt = format!(
        r#"You are a smart analyst. Your goal is to decide what score to assign to the input according to the event description. 

Think clearly and provide reasoning for your answer.

<input>
{}
</input>

<event_name>
{}
</event_name>

<description>
{}
</description>
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
                "description": "Result of tag assignment and reasoning",
                "schema": {
                    "type": "object",
                    "properties": {
                        "reasoning": {
                            "type": "string"
                        },
                        "score": {
                            "type": "number",
                        }
                    },
                    "required": ["reasoning", "score"]
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
    let score = structured_output
        .get("score")
        .expect("assignment score must be provided")
        .as_i64()
        .unwrap_or_default();

    Ok((reasoning, score as usize))
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
            if !res.should_record_event {
                return Ok(());
            }

            let value = if res.should_record_value {
                Some(res.value)
            } else {
                None
            };

            db::events::create_event(
                &db.pool,
                span_id,
                timestamp,
                event_type_id,
                db::events::EventSource::AUTO,
                Some(serde_json::json!({
                    "reasoning": res.reasoning,
                })),
                value,
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
