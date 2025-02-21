use std::collections::HashMap;

use anyhow::Result;
use async_trait::async_trait;

use crate::code_executor::CodeExecutorTrait;
use crate::pipeline::nodes::{HandleType, NodeInput};

pub struct MockCodeExecutor {}

#[async_trait]
impl CodeExecutorTrait for MockCodeExecutor {
    async fn execute(
        &self,
        _code: &String,
        _fn_name: &String,
        _args: &HashMap<String, NodeInput>,
        _return_type: HandleType,
    ) -> Result<NodeInput> {
        Ok(NodeInput::String(String::from(
            "This is a mock response. Code executor is not enabled.",
        )))
    }
}
