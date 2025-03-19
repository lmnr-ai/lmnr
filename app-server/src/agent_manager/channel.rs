use anyhow::Result;
use dashmap::DashMap;
use tokio::sync::mpsc;
use uuid::Uuid;

use super::types::{ControlChunk, WorkerStreamChunk};

const CHANNEL_CAPACITY: usize = 100;

type AgentSender = mpsc::Sender<Result<WorkerStreamChunk>>;
pub type AgentReceiver = mpsc::Receiver<Result<WorkerStreamChunk>>;

struct AgentChannelState {
    sender: AgentSender,
    /// whether the agent finished running for this user message
    is_ended: bool,
    /// whether the frontend explicitly stopped the agent
    is_stopped: bool,
}

pub struct AgentManagerChannel {
    channels: DashMap<Uuid, AgentChannelState>,
}

impl AgentManagerChannel {
    pub fn new() -> Self {
        Self {
            channels: DashMap::new(),
        }
    }

    pub fn is_ended(&self, chat_id: Uuid) -> bool {
        self.channels
            .get(&chat_id)
            // return true if the channel is not found
            .map_or(true, |state| state.is_ended)
    }

    pub fn is_stopped(&self, chat_id: Uuid) -> bool {
        self.channels
            .get(&chat_id)
            .map_or(false, |state| state.is_stopped)
    }

    pub fn create_channel_and_get_rx(&self, chat_id: Uuid) -> AgentReceiver {
        let (sender, receiver) = mpsc::channel(CHANNEL_CAPACITY);
        self.channels.insert(
            chat_id,
            AgentChannelState {
                sender,
                is_ended: false,
                is_stopped: false,
            },
        );
        receiver
    }

    pub async fn try_publish(&self, chat_id: Uuid, chunk: Result<WorkerStreamChunk>) -> Result<()> {
        let Some(state) = self.channels.get(&chat_id) else {
            log::warn!("AgentManagerChannel: try_publish: chat_id not found");
            return Err(anyhow::anyhow!(
                "AgentManagerChannel: try_publish: chat_id not found"
            ));
        };

        state
            .sender
            .send(chunk)
            .await
            .map_err(|e| {
                log::debug!("AgentManagerChannel: try_publish: {}", e);
                let sender = self.channels.remove(&chat_id);
                if let Some(sender) = sender {
                    drop(sender);
                }
            })
            .unwrap_or_default();

        Ok(())
    }

    pub fn end_session(&self, chat_id: Uuid) {
        self.channels.get_mut(&chat_id).map(|mut state| {
            state.value_mut().is_ended = true;
        });
    }

    pub async fn stop_session(&self, chat_id: Uuid) {
        if let Some(mut state) = self.channels.get_mut(&chat_id) {
            state
                .sender
                .send(Ok(WorkerStreamChunk::ControlChunk(ControlChunk::Stop)))
                .await
                .unwrap_or_default();
            state.value_mut().is_stopped = true;
        }
    }
}
