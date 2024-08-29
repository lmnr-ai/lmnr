use std::{collections::HashMap, sync::Arc};

use crate::engine::{RunOutput, RunnableNode};
use crate::pipeline::context::Context;
use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{Handle, HandleType, NodeInput};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct InputNode {
    pub id: Uuid,
    pub name: String,
    pub outputs: Vec<Handle>,
    #[serde(default)]
    pub input: Option<NodeInput>,
    #[serde(rename = "inputType")]
    pub input_type: HandleType,
}

#[async_trait]
impl RunnableNode for InputNode {
    fn handles_mapping(&self) -> Vec<(Uuid, Handle)> {
        Vec::new()
    }

    fn output_handle_id(&self) -> Uuid {
        self.outputs.first().unwrap().id
    }

    fn node_name(&self) -> String {
        self.name.to_owned()
    }

    fn node_id(&self) -> Uuid {
        self.id
    }

    fn node_type(&self) -> String {
        "Input".to_string()
    }

    async fn run(
        &self,
        _inputs: HashMap<String, NodeInput>,
        _context: Arc<Context>,
    ) -> Result<RunOutput> {
        Ok(RunOutput::Success((self.input.clone().unwrap(), None)))
    }
}
