use std::{collections::HashMap, sync::Arc};

use lmnr_baml::BamlContext;
use tokio::sync::mpsc::Sender;
use uuid::Uuid;

use crate::{
    chunk::runner::ChunkerRunner, language_model::LanguageModelRunner,
    semantic_search::SemanticSearch,
};

use super::{nodes::StreamChunk, runner::PipelineRunner, RunType};

#[derive(Debug)]
pub struct Context {
    pub language_model: Arc<LanguageModelRunner>,
    pub chunker_runner: Arc<ChunkerRunner>,
    pub semantic_search: Arc<SemanticSearch>,
    pub env: HashMap<String, String>,
    pub tx: Option<Sender<StreamChunk>>,
    pub metadata: HashMap<String, String>,
    pub run_type: RunType,
    pub pipeline_runner: PipelineRunner,
    /// map from node id to the validated schema.
    /// This is stored in the context before runtime
    /// to avoid the schema being validated on every LLM node run.
    pub baml_schemas: HashMap<Uuid, BamlContext>,
}
