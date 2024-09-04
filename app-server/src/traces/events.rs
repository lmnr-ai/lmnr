use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{
        self,
        event_templates::EventType,
        events::{EvaluateEventRequest, EventObservation, EventSource},
        DB,
    },
    pipeline::{
        nodes::{Node, NodeInput},
        runner::PipelineRunner,
        Graph, RunType,
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
                let event_type = match event_payload.value {
                    None => EventType::BOOLEAN,
                    Some(ref value) => match value {
                        Value::Number(_) => EventType::NUMBER,
                        Value::String(_) => EventType::STRING,
                        Value::Bool(_) => EventType::BOOLEAN,
                        _ => {
                            log::warn!(
                                "Skipping event with unsupported value type: {:?}",
                                event_payload
                            );
                            continue;
                        }
                    },
                };
                // If the user wants to use events for simply logging, create a boolean event, if there's no template for such event
                let event_template = db::event_templates::create_or_update_event_template(
                    &db.pool,
                    id,
                    event_payload.template_name.clone(),
                    project_id,
                    event_type,
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

    db::events::create_events_by_template_name(db, events, event_source, project_id).await
}

pub async fn evaluate_event(
    evaluate_event: EvaluateEventRequest,
    span_id: Uuid,
    pipeline_runner: Arc<PipelineRunner>,
    db: Arc<DB>,
    _cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<Value> {
    // TODO: Use cache to query target_pipeline_version
    let pipeline_version =
        db::pipelines::pipeline_version::get_target_pipeline_version_by_pipeline_name(
            &db.pool,
            project_id,
            &evaluate_event.evaluator,
        )
        .await;

    let Ok(pipeline_version) = pipeline_version else {
        return Err(anyhow::anyhow!("Error when searching for pipeline version"));
    };
    let Some(pipeline_version) = pipeline_version else {
        return Err(anyhow::anyhow!("Pipeline not found for event evaluation"));
    };

    let run_type = RunType::EventEvaluation;
    let mut graph = serde_json::from_value::<Graph>(pipeline_version.runnable_graph)?;

    // TODO: Figure out how to use this metadata and link it to the evaluation event
    let metadata = HashMap::from([("span_id".to_string(), span_id.to_string())]);
    let parent_span_id = None;
    let trace_id = None;

    let inputs = evaluate_event
        .data
        .into_iter()
        .map(|(k, v)| {
            if let NodeInput::Float(f) = v {
                (k, NodeInput::String(f.to_string()))
            } else {
                (k, v)
            }
        })
        .collect();

    graph.setup(&inputs, &evaluate_event.env, &metadata, &run_type)?;

    // Get first output node, expect graph to contain only one output node
    let output_node = graph
        .nodes
        .iter()
        .find(|(_, node)| node.node_type() == "Output")
        .map(|(_, node)| node.clone())
        .unwrap();
    let output_node = match output_node {
        Node::Output(output_node) => output_node,
        _ => {
            return Err(anyhow::anyhow!("Failed to find output node"));
        }
    };

    let run_result = pipeline_runner.run(graph, None).await;
    pipeline_runner
        .record_observations(
            &run_result,
            &project_id,
            &pipeline_version.name,
            parent_span_id,
            trace_id,
        )
        .await?;

    if let Err(e) = run_result {
        return Err(anyhow::anyhow!("Failed to run pipeline: {}", e));
    }
    let run_result = run_result.unwrap();

    let value = run_result.output_values().get(&output_node.name).cloned();
    match value {
        Some(value) => {
            let casted_value = match value {
                NodeInput::Float(f) => Value::Number(serde_json::Number::from_f64(f).unwrap()),
                NodeInput::String(s) => Value::String(s),
                NodeInput::Boolean(b) => Value::Bool(b),
                _ => {
                    return Err(anyhow::anyhow!(
                        "Unsupported value type for event evaluation: {:?}",
                        value
                    ));
                }
            };
            Ok(casted_value)
        }
        None => Err(anyhow::anyhow!("No output from event evaluation")),
    }
}

pub async fn evaluate_and_record_single_event(
    evaluated_event: EvaluateEventRequest,
    span_id: Uuid,
    pipeline_runner: Arc<PipelineRunner>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<()> {
    let mut event_template = db::event_templates::get_event_template_by_name(
        &db.pool,
        &evaluated_event.name,
        project_id,
    )
    .await?;

    let timestamp = evaluated_event.timestamp;
    let data = evaluated_event.data.clone();
    let evaluated_event_name = evaluated_event.name.clone();

    match evaluate_event(
        evaluated_event,
        span_id,
        pipeline_runner,
        db.clone(),
        cache,
        project_id,
    )
    .await
    {
        Ok(res) => {
            if let Some(event_template) = &event_template {
                // Validating the output value
                match res {
                    Value::Number(_) => {
                        if event_template.event_type != EventType::NUMBER {
                            return Err(anyhow::anyhow!(
                                "Received number, but event template {} is not of type NUMBER, project_id: {}",
                                event_template.name,
                                project_id
                            ));
                        }
                    }
                    Value::String(_) => {
                        if event_template.event_type != EventType::STRING {
                            return Err(anyhow::anyhow!(
                                "Received string, but event template {} is not of type STRING, project_id: {}",
                                event_template.name,
                                project_id
                            ));
                        }
                    }
                    Value::Bool(_) => {
                        if event_template.event_type != EventType::BOOLEAN {
                            return Err(anyhow::anyhow!(
                                "Received boolean, but event template {} is not of type BOOLEAN, project_id: {}",
                                event_template.name,
                                project_id
                            ));
                        }
                    }
                    _ => {
                        return Err(anyhow::anyhow!(
                            "Received unsupported value type for {}, project_id: {}",
                            res,
                            project_id
                        ));
                    }
                }
            } else {
                let id = Uuid::new_v4();
                let event_type = match res {
                    Value::Number(_) => EventType::NUMBER,
                    Value::String(_) => EventType::STRING,
                    Value::Bool(_) => EventType::BOOLEAN,
                    _ => {
                        return Err(anyhow::anyhow!(
                            "Received unsupported value type for {}, project_id: {}",
                            res,
                            project_id
                        ));
                    }
                };
                event_template = Some(
                    db::event_templates::create_or_update_event_template(
                        &db.pool,
                        id,
                        evaluated_event_name,
                        project_id,
                        event_type,
                    )
                    .await?,
                );
            }
            let event_template = event_template.unwrap();

            db::events::create_event(
                &db.pool,
                span_id,
                timestamp,
                event_template.id,
                db::events::EventSource::AUTO,
                res,
                serde_json::to_value(data).ok(),
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
pub async fn evaluate_and_record_events(
    evaluated_events: Vec<EvaluateEventRequest>,
    span_id: Uuid,
    pipeline_runner: Arc<PipelineRunner>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<()> {
    let mut tasks = vec![];

    for evaluated_event in evaluated_events {
        let pipeline_runner = pipeline_runner.clone();
        let db = db.clone();
        let cache = cache.clone();
        let task = tokio::spawn(async move {
            evaluate_and_record_single_event(
                evaluated_event,
                span_id,
                pipeline_runner,
                db.clone(),
                cache,
                project_id,
            )
            .await
        });

        tasks.push(task);
    }

    let join_res = futures::future::try_join_all(tasks).await?;
    for res in join_res {
        if let Err(e) = res {
            log::error!("Failed to check and record event: {:?}", e);
        }
    }

    Ok(())
}
