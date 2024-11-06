use anyhow::Result;
use serde::Deserialize;
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

use crate::{
    db::{
        self,
        labels::{LabelJobStatus, LabelSource},
        spans::Span,
        DB,
    },
    language_model::ChatMessage,
    pipeline::{runner::PipelineRunner, utils::render_chat_message_list, Graph, RunType},
    provider_api_keys,
    traces::utils::json_value_to_string,
};

#[derive(Debug, Deserialize)]
struct LLMEvaluatorResult {
    value: String,
    reasoning: String,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum EvaluatorResult {
    LLM(LLMEvaluatorResult),
    Code(String),
}

pub async fn run_evaluator(
    pipeline_runner: Arc<PipelineRunner>,
    project_id: Uuid,
    label_class_id: Uuid,
    span: &Span,
    db: Arc<DB>,
) -> Result<()> {
    let label_class = db::labels::get_label_class(&db.pool, project_id, label_class_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Label class {} not found", label_class_id))?;

    let span_input: Vec<ChatMessage> = span
        .input
        .clone()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let span_output = json_value_to_string(span.output.clone().unwrap_or_default());
    let label_values_map =
        serde_json::from_value::<HashMap<String, f64>>(label_class.value_map.clone())
            .map_err(|e| anyhow::anyhow!("Failed to parse label values map: {}", e))?;

    let graph = label_class
        .evaluator_runnable_graph
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("Evaluator runnable graph not found"))?;
    let mut graph: Graph = serde_json::from_value(graph.clone())?;

    let inputs = HashMap::from([
        (
            "span_input".to_string(),
            render_chat_message_list(span_input).into(),
        ),
        ("span_output".to_string(), span_output.into()),
    ]);

    let env = get_stored_env(db.clone(), project_id).await?;

    let run_type = RunType::AutoLabel;
    graph.setup(&inputs, &env, &HashMap::new(), &run_type)?;

    let run_result = pipeline_runner.run(graph, None).await.map_err(|e| {
        anyhow::anyhow!(
            "Failed to run pipeline for autolabeling: {} ({}): {}",
            label_class.name,
            label_class.id,
            e
        )
    })?;

    let outputs = run_result.output_values();
    let output_str: String = outputs
        .get("output")
        .ok_or_else(|| anyhow::anyhow!("Output not found in run result"))?
        .clone()
        .into();

    let (value, reasoning) = match serde_json::from_str::<EvaluatorResult>(&output_str) {
        Ok(EvaluatorResult::LLM(llm_output)) => (llm_output.value, llm_output.reasoning),
        Ok(EvaluatorResult::Code(code)) => (code, String::new()),
        Err(_) => (output_str, String::new()),
    };

    let label_value = label_values_map.get(&value).cloned().ok_or_else(|| {
        anyhow::anyhow!(
            "Value {} is not a valid label value for {}. Possible values are: {}",
            value,
            label_class.name,
            label_values_map
                .keys()
                .map(|k| k.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )
    })?;

    db::labels::update_span_label(
        &db.pool,
        span.span_id,
        label_value,
        None,
        label_class.id,
        LabelSource::AUTO,
        Some(LabelJobStatus::DONE),
        Some(reasoning),
    )
    .await?;

    Ok(())
}

pub async fn get_stored_env(db: Arc<DB>, project_id: Uuid) -> Result<HashMap<String, String>> {
    let stored_provider_keys =
        db::provider_api_keys::get_api_keys_with_value(&db.pool, &project_id).await?;

    let env = stored_provider_keys
        .iter()
        .filter_map(|db_key| {
            let nonce_hex = &db_key.nonce_hex;
            let encrypted_value = &db_key.value;
            let value =
                provider_api_keys::decode_api_key(&db_key.name, &nonce_hex, &encrypted_value)
                    .map_err(|e| {
                        log::error!("Failed to decode API key: {:?}", e);
                        e
                    })
                    .ok()?;
            Some((db_key.name.clone(), value))
        })
        .collect::<HashMap<_, _>>();

    Ok(env)
}
