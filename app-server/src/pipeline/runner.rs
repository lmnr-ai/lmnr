use std::{collections::HashSet, sync::Arc};

use crate::{
    api::v1::traces::RabbitMqSpanMessage,
    cache::Cache,
    code_executor::CodeExecutor,
    db::{
        spans::Span,
        trace::{CurrentTraceAndSpan, TraceType},
        DB,
    },
    engine::{engine::EngineOutput, Engine},
    features::{is_feature_enabled, Feature},
    routes::pipelines::GraphInterruptMessage,
    traces::{
        utils::{get_llm_usage_for_span, record_span_to_db},
        OBSERVATIONS_EXCHANGE, OBSERVATIONS_ROUTING_KEY,
    },
};
use anyhow::Result;
use itertools::Itertools;
use lapin::{options::BasicPublishOptions, BasicProperties, Connection};
use serde::Serialize;
use tokio::sync::mpsc::Sender;
use uuid::Uuid;

use crate::{language_model::LanguageModelRunner, semantic_search::SemanticSearch};

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

#[derive(Clone)]
pub struct PipelineRunner {
    language_model: Arc<LanguageModelRunner>,
    semantic_search: Arc<dyn SemanticSearch>,
    rabbitmq_connection: Option<Arc<Connection>>,
    code_executor: Arc<dyn CodeExecutor>,
    db: Arc<DB>,
    cache: Arc<Cache>,
}

impl PipelineRunner {
    pub fn new(
        language_model: Arc<LanguageModelRunner>,
        semantic_search: Arc<dyn SemanticSearch>,
        rabbitmq_connection: Option<Arc<Connection>>,
        code_executor: Arc<dyn CodeExecutor>,
        db: Arc<DB>,
        cache: Arc<Cache>,
    ) -> Self {
        Self {
            language_model,
            semantic_search,
            rabbitmq_connection,
            code_executor,
            db,
            cache,
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
            semantic_search: self.semantic_search.clone(),
            env: graph.env.clone(),
            tx: stream_send.clone(),
            metadata: graph.metadata.clone(),
            run_type: graph.run_type.clone(),
            pipeline_runner: self.clone(),
            baml_schemas: validated_schemas,
            code_executor: self.code_executor.clone(),
            db: self.db.clone(),
            cache: self.cache.clone(),
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
            semantic_search: self.semantic_search.clone(),
            env: graph.env.clone(),
            tx: stream_send.clone(),
            metadata: graph.metadata.clone(),
            run_type: graph.run_type.clone(),
            pipeline_runner: self.clone(),
            baml_schemas: validated_schemas,
            code_executor: self.code_executor.clone(),
            db: self.db.clone(),
            cache: self.cache.clone(),
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

    /// Write the engine output to the observations (spans) queue
    pub async fn record_observations(
        &self,
        run_output: &Result<EngineOutput, PipelineRunnerError>,
        project_id: &Uuid,
        pipeline_version_name: &String,
        current_trace_and_span: Option<CurrentTraceAndSpan>,
        trace_type: Option<TraceType>,
    ) -> Result<()> {
        let engine_output = match run_output {
            Ok(engine_output) => engine_output,
            Err(PipelineRunnerError::RunningError(e)) => &e.partial_trace,
            _ => return Ok(()), // nothing to record
        };
        let run_stats = RunTraceStats::from_messages(&engine_output.messages);
        let mut parent_span = Span::create_parent_span_in_run_trace(
            current_trace_and_span,
            &run_stats,
            pipeline_version_name,
            &engine_output.messages,
            trace_type.unwrap_or_default(),
        );

        let message_spans = Span::from_messages(
            &engine_output.messages,
            parent_span.trace_id,
            parent_span.span_id,
            parent_span.get_attributes().path().unwrap(),
        );
        let parent_span_mq_message = RabbitMqSpanMessage {
            project_id: *project_id,
            span: parent_span.clone(),
            events: vec![],
        };

        if is_feature_enabled(Feature::FullBuild) {
            // Safe to unwrap because we checked is_feature_enabled
            let channel = self
                .rabbitmq_connection
                .as_ref()
                .unwrap()
                .create_channel()
                .await?;
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
        } else {
            let span_usage = get_llm_usage_for_span(
                &mut parent_span.get_attributes(),
                self.db.clone(),
                self.cache.clone(),
            )
            .await;
            record_span_to_db(self.db.clone(), &span_usage, project_id, &mut parent_span).await?;

            for mut message_span in message_spans {
                let span_usage = get_llm_usage_for_span(
                    &mut message_span.get_attributes(),
                    self.db.clone(),
                    self.cache.clone(),
                )
                .await;
                record_span_to_db(self.db.clone(), &span_usage, project_id, &mut message_span)
                    .await?;
            }
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
