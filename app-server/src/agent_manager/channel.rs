use anyhow::Result;
use dashmap::DashMap;
use tokio::sync::mpsc;
use uuid::Uuid;

use super::types::RunAgentResponseStreamChunk;

const CHANNEL_CAPACITY: usize = 100;

type AgentSender = mpsc::Sender<Result<RunAgentResponseStreamChunk>>;
pub type AgentReceiver = mpsc::Receiver<Result<RunAgentResponseStreamChunk>>;

struct AgentChannelState {
    sender: AgentSender,
    is_ended: bool,
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

    pub fn create_channel_and_get_rx(&self, chat_id: Uuid) -> AgentReceiver {
        let (sender, receiver) = mpsc::channel(CHANNEL_CAPACITY);
        self.channels.insert(
            chat_id,
            AgentChannelState {
                sender,
                is_ended: false,
            },
        );
        receiver
    }

    pub async fn try_publish(
        &self,
        chat_id: Uuid,
        chunk: Result<RunAgentResponseStreamChunk>,
    ) -> anyhow::Result<()> {
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
}
