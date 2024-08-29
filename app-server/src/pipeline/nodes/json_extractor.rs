use std::{collections::HashMap, sync::Arc};

use crate::engine::{RunOutput, RunnableNode};
use crate::pipeline::context::Context;
use anyhow::Result;
use async_trait::async_trait;
use handlebars::Handlebars;
use handlebars_misc_helpers::json_helpers::json_to_str_fct;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::utils::map_handles;
use super::{Handle, NodeInput};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonExtractorNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    pub template: String,
}

#[async_trait]
impl RunnableNode for JsonExtractorNode {
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
        "JsonExtractor".to_string()
    }

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        _context: Arc<Context>,
    ) -> Result<RunOutput> {
        let input: String = inputs.values().next().unwrap().clone().try_into()?;

        let input: HashMap<String, Value> = serde_json::from_str(&input)?;

        let mut hb = Handlebars::new();
        hb.register_escape_fn(handlebars::no_escape);
        hb.register_helper("json", Box::new(json_to_str_fct));
        let output = hb.render_template(&self.template, &input)?;

        Ok(RunOutput::Success((output.into(), None)))
    }
}
