use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    utils::{map_handles, render_template},
    Handle, NodeInput,
};
use crate::{
    engine::{RunOutput, RunnableNode},
    pipeline::context::Context,
};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StringTemplateNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    #[serde(default)]
    pub dynamic_inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    // mapping from node's input handle's id to the external handle id.
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    pub text: String,
}

#[async_trait]
impl RunnableNode for StringTemplateNode {
    fn handles_mapping(&self) -> Vec<(Uuid, Handle)> {
        let combined_inputs = self
            .inputs
            .iter()
            .chain(self.dynamic_inputs.iter())
            .cloned()
            .collect();

        map_handles(&combined_inputs, &self.inputs_mappings)
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
        "StringTemplate".to_string()
    }

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        _context: Arc<Context>,
    ) -> Result<RunOutput> {
        let rendered_text = render_template(&self.text, &inputs);
        Ok(RunOutput::Success((rendered_text.into(), None)))
    }
}
