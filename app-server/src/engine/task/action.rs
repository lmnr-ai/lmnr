use crate::pipeline::{
    context::Context,
    nodes::{Handle, NodeInput},
    trace::MetaLog,
};
use anyhow::Result;
use async_trait::async_trait;
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

pub enum RunOutput {
    Success((NodeInput, Option<MetaLog>)),
    Termination,
}

#[async_trait]
pub trait RunnableNode {
    /// Mapping from prev node's output handle id to current node's corresponding input handle
    fn handles_mapping(&self) -> Vec<(Uuid, Handle)>;

    fn output_handle_id(&self) -> Uuid;

    fn node_name(&self) -> String;

    fn node_id(&self) -> Uuid;

    fn node_type(&self) -> String;

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        context: Arc<Context>,
    ) -> Result<RunOutput>;
}

pub type Action = Arc<dyn RunnableNode + Send + Sync>;
