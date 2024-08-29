use std::{collections::HashMap, sync::Arc};

use crate::engine::{RunOutput, RunnableNode};
use crate::pipeline::context::Context;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tonic::async_trait;
use uuid::Uuid;

use super::utils::map_handles;
use super::{ConditionedValue, Handle, NodeInput};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    routes: Vec<Route>,
    #[serde(default)]
    has_default_route: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Route {
    name: String,
}

#[async_trait]
impl RunnableNode for SwitchNode {
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
        "Switch".to_string()
    }

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        _context: Arc<Context>,
    ) -> Result<RunOutput> {
        let condition: String = inputs.get("condition").unwrap().clone().try_into()?;
        let input = inputs.get("input").unwrap().clone();

        let output_condition = if self.routes.iter().any(|route| route.name == condition) {
            condition
        } else if self.has_default_route {
            // default output is always the last as ensured by the front-end
            self.routes.last().unwrap().name.clone()
        } else {
            return Err(anyhow::anyhow!(
                "No route found for condition: {}",
                condition
            ));
        };

        let condition_value = ConditionedValue {
            value: Box::new(input.clone()),
            condition: output_condition,
        };

        Ok(RunOutput::Success((condition_value.into(), None)))
    }
}
