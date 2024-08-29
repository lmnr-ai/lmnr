use std::ops::Deref;
use std::{collections::HashMap, sync::Arc};

use crate::engine::{RunOutput, RunnableNode};
use crate::pipeline::context::Context;
use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::utils::map_handles;
use super::NodeInput;
use super::{ConditionedValue, Handle};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    pub condition: String,
}

#[async_trait]
impl RunnableNode for ConditionNode {
    fn handles_mapping(&self) -> Vec<(Uuid, Handle)> {
        map_handles(&self.inputs, &self.inputs_mappings)
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
        "Condition".to_string()
    }

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        _context: Arc<Context>,
    ) -> Result<RunOutput> {
        let input: ConditionedValue = inputs.values().next().unwrap().clone().try_into()?;

        if input.condition == self.condition {
            Ok(RunOutput::Success((input.value.deref().clone(), None)))
        } else {
            Ok(RunOutput::Termination)
        }
    }
}
