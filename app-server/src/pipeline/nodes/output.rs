use std::{collections::HashMap, sync::Arc};

use crate::db::event_templates::EventType;
use crate::engine::{RunOutput, RunnableNode};
use crate::pipeline::context::Context;
use anyhow::{Ok, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::utils::map_handles;
use super::{Handle, NodeInput};

pub fn cast(input: NodeInput, output_cast_type: &EventType) -> Result<NodeInput> {
    match output_cast_type {
        EventType::BOOLEAN => match input {
            NodeInput::Boolean(b) => Ok(NodeInput::Boolean(b)),
            NodeInput::Float(f) => Ok(NodeInput::Boolean(f > 0.0)),
            NodeInput::String(s) => Ok(NodeInput::Boolean(serde_json::from_str::<bool>(&s)?)),
            _ => Err(anyhow::anyhow!("Cannot cast to boolean")),
        },
        EventType::NUMBER => match input {
            NodeInput::Boolean(b) => Ok(NodeInput::Float(if b { 1.0 } else { 0.0 })),
            NodeInput::Float(f) => Ok(NodeInput::Float(f)),
            NodeInput::String(s) => Ok(NodeInput::Float(serde_json::from_str::<f64>(&s)?)),
            _ => Err(anyhow::anyhow!("Cannot cast to number")),
        },
        EventType::STRING => Ok(NodeInput::String(input.into())),
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    #[serde(default)]
    pub output_cast_type: Option<EventType>,
}

#[async_trait]
impl RunnableNode for OutputNode {
    fn handles_mapping(&self) -> Vec<(Uuid, Handle)> {
        map_handles(&self.inputs, &self.inputs_mappings)
    }

    fn output_handle_id(&self) -> Uuid {
        // returning node's id because output node does not point to any other node
        self.id
    }

    fn node_name(&self) -> String {
        self.name.to_owned()
    }

    fn node_id(&self) -> Uuid {
        self.id
    }

    fn node_type(&self) -> String {
        "Output".to_string()
    }

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        _context: Arc<Context>,
    ) -> Result<RunOutput> {
        let input = inputs.values().next().unwrap();

        let output = match &self.output_cast_type {
            None => input.clone(),
            Some(output_cast_type) => {
                let res = cast(input.clone(), output_cast_type)?;
                res
            }
        };

        Ok(RunOutput::Success((output, None)))
    }
}
