use anyhow::Result;
use serde::Deserialize;
use std::{collections::HashMap, env, sync::Arc};
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
    let label_values_map = serde_json::from_value::<Vec<String>>(label_class.value_map.clone())
        .map_err(|e| anyhow::anyhow!("Failed to parse label values map: {}", e))?;

    // before running the job, set the label_job_status to RUNNING
    db::labels::update_span_label(
        &db.pool,
        span.span_id,
        None,
        None,
        label_class.id,
        LabelSource::AUTO,
        Some(LabelJobStatus::RUNNING),
        None,
    )
    .await?;

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
    let env = HashMap::from([("OPENAI_API_KEY".to_string(), env::var("OPENAI_API_KEY")?)]);

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
        Ok(EvaluatorResult::LLM(llm_output)) => {
            (llm_output.value.to_lowercase(), llm_output.reasoning)
        }
        Ok(EvaluatorResult::Code(code)) => (code, String::new()),
        Err(_) => (output_str.to_lowercase(), String::new()),
    };

    let label_value = label_values_map
        .iter()
        .position(|v| v == &value)
        .map(|i| i as f64);

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
