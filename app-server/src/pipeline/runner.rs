use std::{collections::HashSet, sync::Arc};

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    db::trace::Span,
    engine::{engine::EngineOutput, Engine},
    routes::pipelines::GraphInterruptMessage,
    traces::{OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY},
};
use anyhow::Result;
use itertools::Itertools;
use lapin::{options::BasicPublishOptions, BasicProperties, Connection};
use serde::Serialize;
use tokio::sync::mpsc::Sender;
use uuid::Uuid;

use crate::{
    chunk::runner::ChunkerRunner, language_model::LanguageModelRunner,
    semantic_search::SemanticSearch,
};

use super::{
    context::Context,
    nodes::{Message, StreamChunk},
    trace::{RunTrace, RunTraceStats},
    utils::parse_graph,
    Graph, GraphError, InvalidSchemasError,
};

#[derive(Debug)]
pub struct RunningError {
    pub partial_trace: EngineOutput,
}

#[derive(Debug)]
pub struct MissingEnvVarsError {
    pub missing_env_vars: HashSet<String>,
}

// TODO: this one must serialize `RunTraceRepresentation`, with `node_errors`
//       set to traces outputs
impl std::fmt::Display for RunningError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", serde_json::to_string(&self.partial_trace).unwrap())
    }
}

impl std::fmt::Display for MissingEnvVarsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.missing_env_vars.iter().join(", "))
    }
}

impl std::fmt::Display for InvalidSchemasError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            serde_json::to_string(&self.invalid_schemas).unwrap()
        )
    }
}

#[derive(thiserror::Error, Debug)]
pub enum PipelineRunnerError {
    #[error("{0}")]
    GraphError(#[from] GraphError),
    #[error("{0}")]
    DeserializationError(#[from] serde_json::Error),
    #[error("{0}")]
    RunningError(RunningError),
    #[error("{0}")]
    UnhandledError(#[from] anyhow::Error),
    #[error("Missing env vars: {0}")]
    MissingEnvVarsError(MissingEnvVarsError),
    #[error("{0}")]
    TraceWritingError(#[from] tokio::sync::mpsc::error::SendError<RunTrace>),
    #[error("Invalid templates: {0}")]
    InvalidSchemasError(#[from] InvalidSchemasError),
}

impl Serialize for PipelineRunnerError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[derive(Debug, Clone)]
pub struct PipelineRunner {
    language_model: Arc<LanguageModelRunner>,
    chunker_runner: Arc<ChunkerRunner>,
    semantic_search: Arc<SemanticSearch>,
    rabbitmq_connection: Arc<Connection>,
}

impl PipelineRunner {
    pub fn new(
        language_model: Arc<LanguageModelRunner>,
        chunker_runner: Arc<ChunkerRunner>,
        semantic_search: Arc<SemanticSearch>,
        rabbitmq_connection: Arc<Connection>,
    ) -> Self {
        Self {
            language_model,
            chunker_runner,
            semantic_search,
            rabbitmq_connection,
        }
    }

    pub async fn run(
        &self,
        graph: Graph,
        stream_send: Option<Sender<StreamChunk>>,
    ) -> Result<EngineOutput, PipelineRunnerError> {
        let missing_env_vars = graph.get_missing_env_vars();
        if !missing_env_vars.is_empty() {
            return Err(PipelineRunnerError::MissingEnvVarsError(
                MissingEnvVarsError { missing_env_vars },
            ));
        }

        let validated_schemas = graph.validate_baml_schemas()?;

        let context = Context {
            language_model: self.language_model.clone(),
            chunker_runner: self.chunker_runner.clone(),
            semantic_search: self.semantic_search.clone(),
            env: graph.env.clone(),
            tx: stream_send.clone(),
            metadata: graph.metadata.clone(),
            run_type: graph.run_type.clone(),
            pipeline_runner: self.clone(),
            baml_schemas: validated_schemas,
        };

        let tasks = parse_graph(graph)?;

        let mut engine = Engine::with_tasks_and_context(tasks, context, None, None, None);

        match engine.run(stream_send, None, None).await {
            Ok(result) => Ok(result),
            Err(errors) => Err(PipelineRunnerError::RunningError(RunningError {
                partial_trace: errors,
            })),
        }
    }

    pub async fn run_workshop(
        &self,
        graph: Graph,
        stream_send: Option<Sender<StreamChunk>>,
        prefilled_messages: Option<Vec<Message>>,
        start_task_id: Option<Uuid>,
        breakpoint_task_ids: Option<Vec<Uuid>>,
        interrupt_recv: tokio::sync::mpsc::Receiver<GraphInterruptMessage>,
    ) -> Result<EngineOutput, PipelineRunnerError> {
        let missing_env_vars = graph.get_missing_env_vars();
        if !missing_env_vars.is_empty() {
            return Err(PipelineRunnerError::MissingEnvVarsError(
                MissingEnvVarsError { missing_env_vars },
            ));
        }

        let validated_schemas = graph.validate_baml_schemas()?;

        let context = Context {
            language_model: self.language_model.clone(),
            chunker_runner: self.chunker_runner.clone(),
            semantic_search: self.semantic_search.clone(),
            env: graph.env.clone(),
            tx: stream_send.clone(),
            metadata: graph.metadata.clone(),
            run_type: graph.run_type.clone(),
            pipeline_runner: self.clone(),
            baml_schemas: validated_schemas,
        };

        let tasks = parse_graph(graph)?;

        let mut engine = Engine::with_tasks_and_context(
            tasks,
            context,
            prefilled_messages,
            start_task_id,
            breakpoint_task_ids,
        );

        match engine
            .run(stream_send, Some(interrupt_recv), start_task_id)
            .await
        {
            Ok(result) => Ok(result),
            Err(errors) => Err(PipelineRunnerError::RunningError(RunningError {
                partial_trace: errors,
            })),
        }
    }

    pub async fn record_observations(
        &self,
        run_output: &Result<EngineOutput, PipelineRunnerError>,
        project_id: &Uuid,
        pipeline_version_name: &String,
        parent_span_id: Option<Uuid>,
        trace_id: Option<Uuid>,
    ) -> Result<()> {
        let engine_output = match run_output {
            Ok(engine_output) => engine_output,
            Err(PipelineRunnerError::RunningError(e)) => &e.partial_trace,
            _ => return Ok(()), // nothing to record
        };
        let run_stats = RunTraceStats::from_messages(&engine_output.messages);
        let parent_span = Span::create_parent_span_in_run_trace(
            trace_id.unwrap_or_else(Uuid::new_v4),
            &run_stats,
            parent_span_id,
            pipeline_version_name,
        );

        let message_spans = Span::from_messages(
            &engine_output.messages,
            parent_span.trace_id,
            parent_span.span_id,
        );
        let parent_span_mq_message = RabbitMqSpanMessage {
            project_id: *project_id,
            span: parent_span,
            events: vec![],
            evaluate_events: vec![],
        };

        let channel = self.rabbitmq_connection.create_channel().await?;
        let payload = serde_json::to_string(&parent_span_mq_message)?;
        let payload = payload.as_bytes();
        channel
            .basic_publish(
                OBSERVATIONS_EXCHANGE,
                OBSERVATIONS_ROUTING_KEY,
                BasicPublishOptions::default(),
                payload,
                BasicProperties::default(),
            )
            .await?
            .await?;

        for message_span in message_spans {
            let message_mq_message = RabbitMqSpanMessage {
                project_id: *project_id,
                span: message_span,
                events: vec![],
                evaluate_events: vec![],
            };

            let payload = serde_json::to_string(&message_mq_message)?;
            let payload = payload.as_bytes();
            channel
                .basic_publish(
                    OBSERVATIONS_EXCHANGE,
                    OBSERVATIONS_ROUTING_KEY,
                    BasicPublishOptions::default(),
                    payload,
                    BasicProperties::default(),
                )
                .await?
                .await?;
        }

        Ok(())
    }

    pub fn get_trace_from_result(
        res: &Result<EngineOutput, PipelineRunnerError>,
    ) -> Option<EngineOutput> {
        match res {
            Ok(engine_output) => Some(engine_output.clone()),
            Err(PipelineRunnerError::RunningError(e)) => Some(e.partial_trace.clone()),
            _ => None,
        }
    }
}
