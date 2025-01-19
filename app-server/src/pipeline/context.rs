use std::{collections::HashMap, sync::Arc};

use lmnr_baml::BamlContext;
use tokio::sync::mpsc::Sender;
use uuid::Uuid;

use crate::{
    cache::Cache, code_executor::CodeExecutor, db::DB, language_model::LanguageModelRunner,
    semantic_search::SemanticSearch,
};

use super::{nodes::StreamChunk, runner::PipelineRunner, RunType};

pub struct Context {
    pub language_model: Arc<LanguageModelRunner>,
    pub semantic_search: Arc<dyn SemanticSearch>,
    pub env: HashMap<String, String>,
    pub tx: Option<Sender<StreamChunk>>,
    pub metadata: HashMap<String, String>,
    pub run_type: RunType,
    pub pipeline_runner: PipelineRunner,
    /// map from node id to the validated schema.
    /// This is stored in the context before runtime
    /// to avoid the schema being validated on every LLM node run.
    pub baml_schemas: HashMap<Uuid, BamlContext>,
    pub code_executor: Arc<dyn CodeExecutor>,
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
}
