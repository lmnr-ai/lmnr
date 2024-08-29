use std::{collections::HashMap, sync::Arc};

use crate::engine::{RunOutput, RunnableNode};
use crate::pipeline::context::Context;
use anyhow::Result;
use async_trait::async_trait;
use fancy_regex::Regex;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::utils::map_handles;
use super::{ConditionedValue, Handle, NodeInput};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatValidatorNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    pub format: String,
}

#[async_trait]
impl RunnableNode for FormatValidatorNode {
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
        "FormatValidator".to_string()
    }

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        _context: Arc<Context>,
    ) -> Result<RunOutput> {
        let input: String = inputs.values().next().unwrap().clone().try_into()?;

        let re = Regex::new(&self.format).unwrap();
        let condition = if re.is_match(&input).is_ok_and(|m| m) {
            String::from("correct")
        } else {
            String::from("incorrect")
        };

        // future condition nodes would need to match this condition exactly to proceed
        let condition_value = ConditionedValue {
            value: Box::new(NodeInput::String(input)),
            condition: condition,
        };

        Ok(RunOutput::Success((
            NodeInput::ConditionedValue(condition_value),
            None,
        )))
    }
}
