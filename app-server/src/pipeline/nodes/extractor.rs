use std::{collections::HashMap, sync::Arc};

use crate::engine::{RunOutput, RunnableNode};
use crate::pipeline::context::Context;
use anyhow::Result;
use async_trait::async_trait;
use fancy_regex::Regex;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::utils::map_handles;
use super::{Handle, NodeInput};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractorNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    pub format: String,
}

#[async_trait]
impl RunnableNode for ExtractorNode {
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
        "Extractor".to_string()
    }

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        _context: Arc<Context>,
    ) -> Result<RunOutput> {
        let input: String = inputs.values().next().unwrap().clone().try_into()?;

        let re = match Regex::new(&self.format) {
            Ok(re) => re,
            Err(e) => {
                return Err(anyhow::anyhow!(
                    "Failed to compile regex: {}",
                    e.to_string()
                ));
            }
        };

        let output = match re.captures(&input) {
            Ok(Some(captures)) => captures.get(1).map_or("", |m| m.as_str()),
            Ok(None) | Err(_) => "",
        };

        Ok(RunOutput::Success((output.to_string().into(), None)))
    }
}
