use std::{collections::HashMap, sync::Arc};

use crate::code_executor::CodeExecutorTrait;
use crate::engine::{RunOutput, RunnableNode};
use crate::pipeline::context::Context;
use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::utils::map_handles;
use super::{Handle, NodeInput};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeNode {
    pub id: Uuid,
    pub name: String,
    pub inputs: Vec<Handle>,
    pub outputs: Vec<Handle>,
    /// to -> from
    pub inputs_mappings: HashMap<Uuid, Uuid>,
    pub code: String,
    pub fn_name: String,
}

#[async_trait]
impl RunnableNode for CodeNode {
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
        "Code".to_string()
    }

    async fn run(
        &self,
        inputs: HashMap<String, NodeInput>,
        context: Arc<Context>,
    ) -> Result<RunOutput> {
        let output_handle = self.outputs.first();
        if output_handle.is_none() {
            return Err(anyhow::anyhow!("No output handle found"));
        }
        let output_handle = output_handle.unwrap();

        match context
            .code_executor
            .execute(
                &self.code,
                &self.fn_name,
                &inputs,
                output_handle.handle_type.clone(),
            )
            .await
        {
            Ok(result) => Ok(RunOutput::Success((result, None))),
            Err(err) => Err(err.into()),
        }
    }
}
