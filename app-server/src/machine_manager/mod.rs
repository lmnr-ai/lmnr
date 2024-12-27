mod machine_manager_service_grpc;

use anyhow::Result;
use async_trait::async_trait;
use machine_manager_service_client::MachineManagerServiceClient;
pub use machine_manager_service_grpc::*;
use std::sync::Arc;
use tonic::transport::Channel;
use uuid::Uuid;

#[async_trait]
pub trait MachineManager: Send + Sync {
    async fn start_machine(&self) -> Result<Uuid>;

    async fn terminate_machine(&self, machine_id: Uuid) -> Result<()>;

    async fn execute_computer_action(
        &self,
        request: ComputerActionRequest,
    ) -> Result<ComputerActionResponse>;
}

pub struct MachineManagerImpl {
    client: Arc<MachineManagerServiceClient<Channel>>,
}

impl MachineManagerImpl {
    pub fn new(client: Arc<MachineManagerServiceClient<Channel>>) -> Self {
        Self { client }
    }
}

#[async_trait]
impl MachineManager for MachineManagerImpl {
    async fn start_machine(&self) -> Result<Uuid> {
        let mut client = self.client.as_ref().clone();
        let request = tonic::Request::new(StartMachineRequest {});
        let response = client.start_machine(request).await?;

        let machine_id = Uuid::parse_str(&response.into_inner().machine_id)?;
        Ok(machine_id)
    }

    async fn terminate_machine(&self, machine_id: Uuid) -> Result<()> {
        let mut client = self.client.as_ref().clone();
        let request = tonic::Request::new(TerminateMachineRequest {
            machine_id: machine_id.to_string(),
        });

        client.terminate_machine(request).await?;

        Ok(())
    }

    async fn execute_computer_action(
        &self,
        request: ComputerActionRequest,
    ) -> Result<ComputerActionResponse> {
        let mut client = self.client.as_ref().clone();
        let request = tonic::Request::new(request);
        let response = client.execute_computer_action(request).await?;
        Ok(response.into_inner())
    }
}

pub struct MockMachineManager {}

#[async_trait]
impl MachineManager for MockMachineManager {
    async fn start_machine(&self) -> Result<Uuid> {
        todo!()
    }

    async fn terminate_machine(&self, _machine_id: Uuid) -> Result<()> {
        todo!()
    }

    async fn execute_computer_action(
        &self,
        _request: ComputerActionRequest,
    ) -> Result<ComputerActionResponse> {
        todo!()
    }
}
