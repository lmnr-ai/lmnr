use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use async_trait::async_trait;
use tonic::{transport::Channel, Request};

use crate::pipeline::nodes::{HandleType, NodeInput};

use super::code_executor_grpc::{
    code_executor_client::CodeExecutorClient, ExecuteCodeRequest, HandleType as GrpcHandleType,
};
use super::CodeExecutorTrait;

pub struct CodeExecutorImpl {
    client: Arc<CodeExecutorClient<Channel>>,
}

impl CodeExecutorImpl {
    pub fn new(client: Arc<CodeExecutorClient<Channel>>) -> Self {
        Self { client }
    }
}

#[async_trait]
impl CodeExecutorTrait for CodeExecutorImpl {
    async fn execute(
        &self,
        code: &String,
        fn_name: &String,
        args: &HashMap<String, NodeInput>,
        return_type: HandleType,
    ) -> Result<NodeInput> {
        let mut client = self.client.as_ref().clone();

        let request = Request::new(ExecuteCodeRequest {
            code: code.clone(),
            fn_name: fn_name.clone(),
            args: args
                .into_iter()
                .map(|(k, v)| (k.clone(), v.clone().into()))
                .collect(),
            return_type: Into::<GrpcHandleType>::into(return_type) as i32,
        });

        let response = client.execute(request).await?;

        response.into_inner().try_into()
    }
}
